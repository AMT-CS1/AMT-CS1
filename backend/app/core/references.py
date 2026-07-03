"""
Per-problem file storage in MinIO.

Layout (one folder per problem):
  problems/{problem_id}_{problem_key}/reference_solution/{filename}           .dap source
  problems/{problem_id}_{problem_key}/reference_solution/{filename}.ast.json  cached AST
  problems/{problem_id}_{problem_key}/code_submission/{attempt_id}.dap        student code
  problems/{problem_id}_{problem_key}/code_submission/{attempt_id}.ast.json   student AST

Reference files are the ground truth for misconception detection: a student's
AST is diffed against every reference AST and the closest match (fewest edits)
provides the reported misconceptions.
"""
import json
import logging
import re

from app.core.misconception import generate_ast_json
from app.core.storage import (
    delete_minio_object,
    download_text_from_minio,
    list_minio_keys,
    upload_text_to_minio,
)
from app.models.problem import Problem

logger = logging.getLogger(__name__)

AST_SUFFIX = ".ast.json"

def problem_folder(problem: Problem) -> str:
    return f"problems/{problem.id}_{problem.key}"

def reference_prefix(problem: Problem) -> str:
    return f"{problem_folder(problem)}/reference_solution/"

def submission_prefix(problem: Problem) -> str:
    return f"{problem_folder(problem)}/code_submission/"

def sanitize_reference_filename(filename: str) -> str:
    """Basename only, safe charset, .dap extension enforced."""
    name = filename.replace("\\", "/").split("/")[-1].strip()
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    if not name or name.startswith("."):
        raise ValueError("Invalid reference filename")
    if name.endswith(AST_SUFFIX):
        raise ValueError("Reference filename may not end with .ast.json")
    if not name.endswith(".dap"):
        name += ".dap"
    return name

async def list_reference_filenames(problem: Problem) -> list[str]:
    prefix = reference_prefix(problem)
    keys = await list_minio_keys(prefix)
    return sorted(
        key[len(prefix):] for key in keys
        if not key.endswith(AST_SUFFIX) and key != prefix
    )

async def get_reference_content(problem: Problem, filename: str) -> str | None:
    return await download_text_from_minio(f"{reference_prefix(problem)}{filename}")

async def upload_reference_file(problem: Problem, filename: str, content: str, ast: dict) -> str:
    """Store a validated reference solution together with its compiled AST."""
    key = f"{reference_prefix(problem)}{filename}"
    await upload_text_to_minio(key, content)
    await upload_text_to_minio(f"{key}{AST_SUFFIX}", json.dumps(ast), content_type="application/json")
    return key

async def delete_reference_file(problem: Problem, filename: str) -> bool:
    key = f"{reference_prefix(problem)}{filename}"
    deleted = await delete_minio_object(key)
    await delete_minio_object(f"{key}{AST_SUFFIX}")
    return deleted

async def get_reference_ast(problem: Problem, filename: str) -> dict | None:
    """Cached AST of a reference file; compiles and caches it when missing."""
    key = f"{reference_prefix(problem)}{filename}"
    ast_text = await download_text_from_minio(f"{key}{AST_SUFFIX}")
    if ast_text:
        try:
            return json.loads(ast_text)
        except json.JSONDecodeError:
            logger.warning("Cached AST for %s is not valid JSON; recompiling", key)
    content = await download_text_from_minio(key)
    if not content:
        return None
    ast = await generate_ast_json(content)
    if ast is not None:
        try:
            await upload_text_to_minio(f"{key}{AST_SUFFIX}", json.dumps(ast), content_type="application/json")
        except Exception as e:
            logger.warning("Failed to cache AST for %s: %s", key, e)
    return ast

async def load_reference_files(problem: Problem, with_ast: bool = True) -> list[dict]:
    """All reference files for a problem as [{filename, content, ast?}]."""
    files: list[dict] = []
    for filename in await list_reference_filenames(problem):
        entry: dict = {
            "filename": filename,
            "content": await get_reference_content(problem, filename),
        }
        if with_ast:
            entry["ast"] = await get_reference_ast(problem, filename)
        files.append(entry)
    return files

async def load_reference_asts(problem: Problem) -> list[dict]:
    """Reference ASTs for misconception detection: [{filename, ast}] (ast never None)."""
    asts = []
    for filename in await list_reference_filenames(problem):
        ast = await get_reference_ast(problem, filename)
        if ast is not None:
            asts.append({"filename": filename, "ast": ast})
    return asts
