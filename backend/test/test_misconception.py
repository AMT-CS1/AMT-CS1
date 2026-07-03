import asyncio
from pathlib import Path

from app.core.misconception import generate_ast_json, detect_misconceptions

DATA_DIR = Path(__file__).resolve().parents[1] / "app" / "DAP" / "data"

CORRECT_LOOP = """program Count
dictionary
    i, n : integer
algorithm
    read n
    i <- 1
    while i <= n do
        write i
        i <- i + 1
    endwhile
endprogram
"""

BUGGY_IF_INSTEAD_OF_LOOP = CORRECT_LOOP.replace(
    "while i <= n do", "if i <= n then"
).replace("endwhile", "endif")


def test_generate_ast_json_valid_code():
    ast = asyncio.run(generate_ast_json(CORRECT_LOOP))
    assert isinstance(ast, dict)
    assert ast.get("type") == "ListNode"
    assert isinstance(ast.get("program"), list)


def test_generate_ast_json_invalid_code_returns_none():
    ast = asyncio.run(generate_ast_json("this is not dap code"))
    assert ast is None


def test_detect_cd13_if_instead_of_loop():
    async def run():
        buggy = await generate_ast_json(BUGGY_IF_INSTEAD_OF_LOOP)
        correct = await generate_ast_json(CORRECT_LOOP)
        assert buggy is not None and correct is not None
        return detect_misconceptions(buggy, correct)

    results = asyncio.run(run())
    codes = {m["code"] for m in results}
    assert "CD-13" in codes
    cd13 = next(m for m in results if m["code"] == "CD-13")
    assert cd13["title"]
    # Hints shown to students must never reveal the reference solution
    assert "correct_expr" not in cd13


def test_detect_misconceptions_identical_code_is_empty():
    async def run():
        a = await generate_ast_json(CORRECT_LOOP)
        b = await generate_ast_json(CORRECT_LOOP)
        return detect_misconceptions(a, b)

    assert asyncio.run(run()) == []


def test_detect_misconceptions_on_bundled_sample():
    buggy_code = (DATA_DIR / "b_p1_student01.dap").read_text(encoding="utf-8")
    correct_code = (DATA_DIR / "c_p1_reference.dap").read_text(encoding="utf-8")

    async def run():
        buggy = await generate_ast_json(buggy_code)
        correct = await generate_ast_json(correct_code)
        assert buggy is not None and correct is not None
        return detect_misconceptions(buggy, correct)

    results = asyncio.run(run())
    # Generic logic differences (like i <- 0 vs i <- 1) are now filtered out,
    # so this sample returns an empty list.
    assert len(results) == 0
