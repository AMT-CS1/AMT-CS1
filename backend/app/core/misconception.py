"""
Adapter between the attempt-submission pipeline and the DAP misconception
engine (app/DAP/repair.py).

- generate_ast_json: compiles DAP source to a normalized JSON AST via the
  compiler's --show-ast-json flag (one call per submission; the AST is then
  persisted so the compiler never has to be re-invoked for this code).
- detect_misconceptions: diffs a student AST against a reference-solution AST
  and returns serializable misconception entries for storage and display.
"""
import copy
import json
import logging
import os
import subprocess
import tempfile
import uuid

import anyio

from app.core.dap_runner import DAP_PATH
from app.DAP import repair

logger = logging.getLogger(__name__)


def _generate_ast_json_sync(code: str, timeout: float = 5.0) -> dict | None:
    temp_file_path = os.path.join(tempfile.gettempdir(), f"ast_{uuid.uuid4().hex}.dap")
    try:
        with open(temp_file_path, "w", encoding="utf-8") as f:
            f.write(code)

        result = subprocess.run(
            [DAP_PATH, temp_file_path, "--show-ast-json"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            return None

        ast = json.loads(result.stdout.strip())
        # Same normalization repair.get_ast applies before diffing
        ast = repair.normalize_ast(ast)
        repair.cleanup_dictionary_node(ast)
        return ast
    except Exception as e:
        logger.warning("AST generation failed: %s", e)
        return None
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass


async def generate_ast_json(code: str, timeout: float = 5.0) -> dict | None:
    """Compiles DAP source to a normalized JSON AST, or None on any failure."""
    return await anyio.to_thread.run_sync(_generate_ast_json_sync, code, timeout)


def detect_misconceptions(student_ast: dict, reference_ast: dict) -> list[dict]:
    """
    Diffs the student's AST against the reference-solution AST and returns a
    list of {code, title, description, detail, buggy_expr} entries.

    correct_expr is intentionally not included: hints shown to students must
    not reveal the reference solution.
    """
    try:
        edit_logs: list[dict] = []
        buggy = copy.deepcopy(student_ast)  # diff_and_repair mutates in place
        correct = copy.deepcopy(reference_ast)
        repair.diff_and_repair(buggy, correct, edit_logs=edit_logs)

        results: list[dict] = []
        seen_codes: set[str] = set()
        for log in edit_logs:
            m = log.get("misconception")
            if m:
                entry = {
                    "code": m.get("code", "GEN"),
                    "title": m.get("title", "Logic difference"),
                    "description": m.get("description", ""),
                    "detail": log.get("detail", ""),
                    "buggy_expr": log.get("buggy_expr", ""),
                }
            else:
                entry = {
                    "code": "GEN",
                    "title": "Logic difference",
                    "description": "Your code's logic differs from the expected approach here.",
                    "detail": log.get("detail", ""),
                    "buggy_expr": log.get("buggy_expr", ""),
                }
            dedupe_key = f"{entry['code']}|{entry['detail']}"
            if dedupe_key in seen_codes:
                continue
            seen_codes.add(dedupe_key)
            results.append(entry)
        return results
    except Exception as e:
        logger.warning("Misconception detection failed: %s", e)
        return []
