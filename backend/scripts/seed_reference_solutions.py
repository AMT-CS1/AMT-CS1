"""
Seed reference solution files for every problem via the backend API.

Reads the verified .dap files from scripts/reference_solutions/{problem_key}/
and uploads them with POST /problems/{id}/references, which validates that each
file compiles and stores it (plus its cached AST) in MinIO under
problems/{problem_id}_{problem_key}/reference_solution/.

Stdlib-only on purpose: it runs from any machine that can reach the API,
no backend virtualenv required.

Usage:
    python scripts/seed_reference_solutions.py [--api http://localhost:8000]
        [--username instructor_user] [--password instructorpass]
"""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SOLUTIONS_DIR = Path(__file__).parent / "reference_solutions"


def request(url: str, method: str = "GET", data: bytes | None = None, headers: dict | None = None):
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body) if body else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--username", default="instructor_user")
    parser.add_argument("--password", default="instructorpass")
    args = parser.parse_args()

    login = request(
        f"{args.api}/auth/token",
        method="POST",
        data=urllib.parse.urlencode({"username": args.username, "password": args.password}).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token = login["access_token"]
    auth = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    problems = request(f"{args.api}/problems", headers=auth)
    by_key = {p["key"]: p for p in problems}

    seeded = skipped = failed = 0
    for problem_dir in sorted(SOLUTIONS_DIR.iterdir()):
        if not problem_dir.is_dir():
            continue
        key = problem_dir.name
        problem = by_key.get(key)
        if problem is None:
            print(f"SKIP  {key}: no problem with this key in the database")
            skipped += 1
            continue

        files = [
            {"filename": f.name, "content": f.read_text(encoding="utf-8")}
            for f in sorted(problem_dir.glob("*.dap"))
        ]
        if not files:
            print(f"SKIP  {key}: no .dap files")
            skipped += 1
            continue

        try:
            result = request(
                f"{args.api}/problems/{problem['id']}/references",
                method="POST",
                data=json.dumps({"files": files}).encode(),
                headers=auth,
            )
            names = ", ".join(f["filename"] for f in result)
            print(f"OK    {key}: {names}")
            seeded += 1
        except urllib.error.HTTPError as e:
            print(f"FAIL  {key}: HTTP {e.code} {e.read().decode()[:200]}")
            failed += 1

    print(f"\nDone. {seeded} problems seeded, {skipped} skipped, {failed} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
