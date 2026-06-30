import os
import subprocess
import tempfile
import uuid
import asyncio
from app.core.llm import get_llm_provider


def _get_dap_path() -> str:
    env_path = os.environ.get("DAP_PATH")
    if env_path:
        return env_path
        
    docker_path = "/usr/local/bin/dap"
    if os.path.exists(docker_path):
        return docker_path
        
    default_path = "/app/dap"
    if os.path.exists(default_path):
        return default_path
        
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    if os.name == 'nt':
        local_dap_exe = os.path.join(base_dir, "dap.exe")
        if os.path.exists(local_dap_exe):
            return local_dap_exe
            
        local_dap = os.path.join(base_dir, "dap")
        if os.path.exists(local_dap):
            try:
                import shutil
                shutil.copy2(local_dap, local_dap_exe)
                return local_dap_exe
            except Exception:
                return local_dap
        return "dap.exe"
    else:
        local_dap = os.path.join(base_dir, "dap")
        if os.path.exists(local_dap):
            return local_dap
        return "dap"

DAP_PATH = _get_dap_path()


def _run_dap_code_sync(code: str, stdin_data: str = "", timeout: float = 2.0) -> dict:
    """
    Synchronous helper to run DAP compiler in a subprocess.
    Executed in a background thread to prevent blocking the event loop.
    """
    temp_dir = tempfile.gettempdir()
    temp_file_path = os.path.join(temp_dir, f"sub_{uuid.uuid4().hex}.dap")
    
    try:
        with open(temp_file_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        # Ensure dap binary is executable
        if os.path.exists(DAP_PATH):
            try:
                os.chmod(DAP_PATH, 0o755)
            except Exception:
                pass
                
        process = subprocess.Popen(
            [DAP_PATH, temp_file_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        try:
            stdout, stderr = process.communicate(input=stdin_data, timeout=timeout)
            exit_code = process.returncode
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            return {
                "success": False,
                "error": "Execution timed out (possible infinite loop)",
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": -1
            }
            
        return {
            "success": exit_code == 0,
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": exit_code
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "stdout": "",
            "stderr": str(e),
            "exit_code": -99
        }
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

async def run_dap_code(code: str, stdin_data: str = "", timeout: float = 2.0) -> dict:
    """
    Runs the DAP compiler asynchronously using anyio thread offloading.
    """
    import anyio
    return await anyio.to_thread.run_sync(_run_dap_code_sync, code, stdin_data, timeout)

async def evaluate_student_attempt(problem_or_ref: object, code: str) -> dict:
    """
    Evaluates student code against the predefined test cases for a task.
    problem_or_ref can be a Problem DB object, a dict, or a string task_ref fallback.
    """
    if isinstance(problem_or_ref, str):
        problem = None
    else:
        problem = problem_or_ref

    if not problem:
        ref_str = problem_or_ref if isinstance(problem_or_ref, str) else "Unknown"
        return {
            "success": False,
            "error": f"Unknown problem reference: '{ref_str}'",
            "passed": False,
            "test_results": []
        }
        
    if isinstance(problem, dict):
        test_cases = problem["test_cases"]
    else:
        test_cases = problem.test_cases

    test_results = []
    all_passed = True
    compilation_error = None
    
    # We can gather test runs concurrently!
    async def run_case(idx, tc_input, tc_expected):
        run = await run_dap_code(code, stdin_data=tc_input)
        return idx, tc_input, tc_expected, run

    tasks = []
    for idx, tc in enumerate(test_cases):
        tc_input = tc["input"] if isinstance(tc, dict) else getattr(tc, "input", "")
        tc_expected = tc["expected"] if isinstance(tc, dict) else getattr(tc, "expected", "")
        tasks.append(run_case(idx, tc_input, tc_expected))
        
    runs = await asyncio.gather(*tasks)
    
    # Sort runs by index to maintain ordering
    runs.sort(key=lambda x: x[0])
    
    for idx, tc_input, tc_expected, run in runs:
        if not run["success"] and "timed out" in run.get("error", ""):
            test_results.append({
                "test_case_index": idx + 1,
                "input": tc_input,
                "expected": tc_expected,
                "actual": "",
                "passed": False,
                "error": run["error"]
            })
            all_passed = False
            continue
        elif not run["success"]:
            # If the compiler returned an error
            compilation_error = run["stderr"] or run["error"]
            all_passed = False
            test_results.append({
                "test_case_index": idx + 1,
                "input": tc_input,
                "expected": tc_expected,
                "actual": "",
                "passed": False,
                "error": compilation_error
            })
            continue
            
        # Parse output and compare tokens
        actual_output = run["stdout"]
        
        actual_tokens = [t.strip() for t in actual_output.strip().split() if t.strip()]
        expected_tokens = [t.strip() for t in tc_expected.strip().split() if t.strip()]
        
        passed = (actual_tokens == expected_tokens)
        if not passed:
            all_passed = False
            
        test_results.append({
            "test_case_index": idx + 1,
            "input": tc_input,
            "expected": tc_expected.strip(),
            "actual": actual_output.strip(),
            "passed": passed,
            "error": None
        })
        
    return {
        "success": compilation_error is None,
        "passed": all_passed and (compilation_error is None),
        "compilation_error": compilation_error,
        "test_results": test_results
    }

async def generate_feedback(problem_or_ref: object, code: str, eval_results: dict, lang: str = "en") -> str:
    """
    Asynchronously invokes the LLM provider to generate pedagogical Socratic feedback.
    """
    
    if isinstance(problem_or_ref, str):
        problem = None
    else:
        problem = problem_or_ref

    if not problem:
        return "Unknown problem reference."
        
    if isinstance(problem, dict):
        title = problem["title"]
        description = problem.get(f"description_{lang}") or problem.get("description_en") or problem.get("description")
    else:
        title = problem.title
        description = getattr(problem, f"description_{lang}", None) or getattr(problem, "description_en", None) or getattr(problem, "description", None)
    
    # Extract details of failing test cases
    failed_details = []
    for tc in eval_results.get("test_results", []):
        if not tc["passed"]:
            tc_desc = (
                f"- Test Case #{tc['test_case_index']}:\n"
                f"  Stdin Input: '{tc['input'].strip()}'\n"
                f"  Expected Output: '{tc['expected']}'\n"
                f"  Actual Output: '{tc['actual']}'"
            )
            if tc.get("error"):
                tc_desc += f"\n  Error: {tc['error']}"
            failed_details.append(tc_desc)
            
    failed_text = "\n".join(failed_details)
    
    compilation_error = eval_results.get("compilation_error")
    error_context = ""
    if compilation_error:
        error_context = (
            f"The program failed to compile or run with this error:\n"
            f"```\n"
            f"{compilation_error}\n"
            f"```\n\n"
        )
        
    tutor_intro = (
        "You are a friendly, supportive computer science tutor helping a student learn basic programming logic.\n"
        "The student is submitting code written in 'DAP' (a simple pseudocode language)."
    ) if lang != "id" else (
        "Anda adalah asisten tutor ilmu komputer yang ramah dan suportif membantu siswa belajar logika pemrograman dasar.\n"
        "Siswa mengirimkan kode yang ditulis dalam 'DAP' (bahasa pseudocode sederhana)."
    )

    lang_rule = "- Respond in English." if lang != "id" else "- Respond in Indonesian (Bahasa Indonesia)."

    prompt = (
        f"{tutor_intro}\n\n"
        f"Problem: {title}\n"
        f"Description:\n{description}\n\n"
        f"Student's Code:\n"
        f"```javascript\n"
        f"{code}\n"
        f"```\n\n"
        f"{error_context}"
        f"Failed Test Cases:\n"
        f"{failed_text if failed_text else '(No stdout output returned or output was empty)'}\n\n"
        f"Provide supportive, Socratic guidance to the student. Follow these rules strictly:\n"
        f"- Do NOT write or provide the corrected code. Keep it Socratic.\n"
        f"- Identify the logical issue (e.g. incorrect order of assignments, wrong loop condition) or syntax issue.\n"
        f"- Be concise (less than 150 words) and encouraging.\n"
        f"{lang_rule}"
    )
    
    try:
        provider = get_llm_provider()
        print(provider, "provider")
        feedback = await provider.generate(prompt)
        return feedback
    except Exception as e:
        return f"Could not generate automated tutor feedback: {str(e)}"

