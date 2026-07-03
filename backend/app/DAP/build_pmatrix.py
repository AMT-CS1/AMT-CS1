import csv
from pathlib import Path
from typing import Any
try:
    from app.DAP import repair
except ImportError:
    import repair

# A mapping of challenge IDs to their base required concepts in the Q-Matrix
CHALLENGE_CONCEPTS: dict[str, list[int]] = {
    "l8": [1, 1, 1, 1, 1, 0, 0],   # CO, VA, OP, EX, IO required
    "362": [1, 1, 1, 1, 1, 0, 0],
    "371": [0, 1, 1, 1, 1, 1, 1],
    "p1": [0, 1, 0, 0, 0, 0, 1],   # VA & LO
    "p2": [0, 1, 0, 0, 0, 1, 0],   # VA & CD
    "p3": [0, 1, 1, 1, 0, 0, 0],   # VA & OP & EX
}


def load_qmatrix(qmatrix_path: str | Path) -> None:
    """Loads default Q-Matrix values from problemQmatrix.CSV if available."""
    q_path = Path(qmatrix_path)
    if q_path.exists():
        with open(q_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                if not row:
                    continue
                challenge_id = row[0]
                vector = [int(x) for x in row[1:]]
                CHALLENGE_CONCEPTS[challenge_id] = vector


def detect_ast_failures(buggy, correct, current_context=None):
    """
    Recursively diffs buggy AST with correct AST to determine which concept failed.
    Returns a set of failed concept indices (1-indexed based on:
    1: CO, 2: VA, 3: OP, 4: EX, 5: IO, 6: CD, 7: LO).
    """
    failed_concepts = set()
    if not isinstance(buggy, dict) or not isinstance(correct, dict):
        return failed_concepts
        
    t = buggy.get("type")
    
    # Track syntax context to map to specific cognitive concepts
    context = current_context
    if t in ["IfNode", "WhileNode", "ForNode", "DictionaryNode"]:
        context = t
        
    # 1. Structural type mismatch
    if buggy.get("type") != correct.get("type"):
        if context == "IfNode":
            failed_concepts.add(6) # CD
        elif context in ["WhileNode", "ForNode"]:
            failed_concepts.add(7) # LO
        elif context == "DictionaryNode":
            failed_concepts.add(2) # VA
        elif context == "IO":
            failed_concepts.add(5) # IO
        else:
            failed_concepts.add(4) # EX
        return failed_concepts

    # 2. Key value mismatches
    if t == "BinOpNode":
        if buggy.get("operator") != correct.get("operator"):
            if context == "IfNode":
                failed_concepts.add(6) # CD
            elif context in ["WhileNode", "ForNode"]:
                failed_concepts.add(7) # LO
            else:
                failed_concepts.add(3) # OP
        failed_concepts.update(detect_ast_failures(buggy.get("left"), correct.get("left"), context))
        failed_concepts.update(detect_ast_failures(buggy.get("right"), correct.get("right"), context))
        
    elif t in ["NumberNode", "StringNode", "BooleanNode"]:
        if buggy.get("value") != correct.get("value"):
            if context == "IfNode":
                failed_concepts.add(6) # CD
            elif context in ["WhileNode", "ForNode"]:
                failed_concepts.add(7) # LO
            else:
                failed_concepts.add(1) # CO
                
    elif t == "VarAccessToken":
        if buggy.get("name") != correct.get("name"):
            failed_concepts.add(2) # VA
                
    elif t == "VarAssignNode":
        if buggy.get("name") != correct.get("name"):
            failed_concepts.add(2) # VA
        failed_concepts.update(detect_ast_failures(buggy.get("value"), correct.get("value"), context))
        
    elif t == "CallNode":
        call_name = buggy.get("call", {}).get("name") if isinstance(buggy.get("call"), dict) else buggy.get("call")
        correct_call_name = correct.get("call", {}).get("name") if isinstance(correct.get("call"), dict) else correct.get("call")
        is_io = call_name in ["read", "write", "print"] or correct_call_name in ["read", "write", "print"]
        
        if call_name != correct_call_name:
            if is_io:
                failed_concepts.add(5) # IO
            else:
                failed_concepts.add(4) # EX
                
        b_args = buggy.get("args", [])
        c_args = correct.get("args", [])
        if len(b_args) == len(c_args):
            for b_arg, c_arg in zip(b_args, c_args):
                failed_concepts.update(detect_ast_failures(b_arg, c_arg, "IO" if is_io else context))
        else:
            if is_io:
                failed_concepts.add(5) # IO
            else:
                failed_concepts.add(4) # EX
                
    elif t == "IfNode":
        if len(buggy.get("cases", [])) == len(correct.get("cases", [])):
            for b_case, c_case in zip(buggy.get("cases", []), correct.get("cases", [])):
                failed_concepts.update(detect_ast_failures(b_case.get("condition"), c_case.get("condition"), "IfNode"))
                failed_concepts.update(detect_ast_failures(b_case.get("body"), c_case.get("body"), "IfNode"))
        else:
            failed_concepts.add(6) # CD
            
    elif t in ["WhileNode", "ForNode"]:
        failed_concepts.update(detect_ast_failures(buggy.get("condition"), correct.get("condition"), t))
        failed_concepts.update(detect_ast_failures(buggy.get("body"), correct.get("body"), t))
        
    elif t == "ListNode":
        b_prog = buggy.get("program", [])
        c_prog = correct.get("program", [])
        # Align statements structurally so missing/extra statements are
        # detected instead of silently yielding a clean vector.
        matches, unmatched_b, unmatched_c = repair.align_lists(b_prog, c_prog)
        for b_idx, c_idx in matches:
            failed_concepts.update(detect_ast_failures(b_prog[b_idx], c_prog[c_idx], context))
        for idx_list, prog in ((unmatched_b, b_prog), (unmatched_c, c_prog)):
            for idx in idx_list:
                stmt = prog[idx]
                s_type = stmt.get("type") if isinstance(stmt, dict) else None
                if s_type == "IfNode":
                    failed_concepts.add(6)  # CD
                elif s_type in ("WhileNode", "ForNode"):
                    failed_concepts.add(7)  # LO
                elif s_type == "VarAssignNode":
                    failed_concepts.add(2)  # VA
                else:
                    stmt_call = stmt.get("call", {}).get("name") if isinstance(stmt.get("call"), dict) else stmt.get("call") if isinstance(stmt, dict) else None
                    if stmt_call in ["read", "write", "print"]:
                        failed_concepts.add(5) # IO
                    else:
                        failed_concepts.add(4)  # EX
                
    elif t == "DictionaryNode":
        if len(buggy.get("variables", [])) == len(correct.get("variables", [])):
            for b_var, c_var in zip(buggy.get("variables", []), correct.get("variables", [])):
                failed_concepts.update(detect_ast_failures(b_var, c_var, "DictionaryNode"))
        else:
            failed_concepts.add(2) # VA
            
    return failed_concepts

def generate_pmatrix_file(data_dir: str | Path, qmatrix_path: str | Path) -> None:
    """Automatically constructs P-matrix-out.CSV based on folder submissions and AST diffs."""
    load_qmatrix(qmatrix_path)
    
    pmatrix_rows = []
    data_path = Path(data_dir)
    
    # Scan all files in directory
    files = []
    if data_path.exists() and data_path.is_dir():
        for f in data_path.iterdir():
            if f.is_file() and f.name.endswith(".dap") and not f.name.startswith("repaired_") and not f.name.startswith("temp_repaired_"):
                files.append(f.name)
    
    for filename in files:
        challenge_id = repair.get_challenge_id(filename)
        
        # Get base concepts vector from Q-matrix
        base_vector = CHALLENGE_CONCEPTS.get(challenge_id, [1, 1, 1, 1, 1, 0, 0]).copy()
        
        if filename.startswith("c_"):
            # Correct files keep all base required concepts as 1
            pmatrix_rows.append([filename] + [str(x) for x in base_vector])
            print(f"[BUILD] {filename} is correct -> Base vector: {base_vector}")
            
        elif filename.startswith("b_"):
            # Buggy files need AST comparison to identify concept failures
            buggy_path = data_path / filename
            ref_paths = repair.find_reference_files(filename, data_path)
            
            if not ref_paths:
                print(f"[WARN] No correct reference template found for buggy code {filename}. Defaulting to base vector.")
                pmatrix_rows.append([filename] + [str(x) for x in base_vector])
                continue
                
            try:
                buggy_ast = repair.get_ast(buggy_path)
                
                best_failures = None
                best_ref_path = None
                
                for ref_path in ref_paths:
                    ref_path_obj = Path(ref_path)
                    correct_ast = repair.get_ast(ref_path_obj)
                    failures = detect_ast_failures(buggy_ast, correct_ast)
                    if best_failures is None or len(failures) < len(best_failures):
                        best_failures = failures
                        best_ref_path = ref_path_obj
                
                failures = best_failures
                print(f"[BUILD] {filename}: chose reference {best_ref_path.name} with {len(failures)} failures.")
                
                # Flip mastery of failed concepts from 1 to 0
                for f_concept in failures:
                    concept_index = f_concept - 1  # convert to 0-indexed vector index
                    if concept_index < len(base_vector):
                        base_vector[concept_index] = 0
                        
                pmatrix_rows.append([filename] + [str(x) for x in base_vector])
                print(f"[BUILD] {filename} is buggy -> Derived vector: {base_vector} (failures: {list(failures)})")
                
            except Exception as e:
                print(f"[ERROR] Failed to compile AST for {filename}: {e}. Writing base vector.")
                pmatrix_rows.append([filename] + [str(x) for x in base_vector])
                
    # Save to P-matrix-out.CSV
    pmatrix_path = data_path / "P-matrix-out.CSV"
    with open(pmatrix_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(pmatrix_rows)
    print(f"\n[SUCCESS] Generated and saved P-Matrix to: {pmatrix_path}")


def get_present_concepts(node: Any, concepts_found: set[int] = None) -> set[int]:
    """Recursively walks the AST to find which of the 7 concepts are present."""
    if concepts_found is None:
        concepts_found = set()
        
    if not isinstance(node, dict):
        if isinstance(node, list):
            for item in node:
                get_present_concepts(item, concepts_found)
        return concepts_found
        
    t = node.get("type")
    
    # 1: CO (Constant), 2: VA (Variable), 3: OP (Operation), 4: EX (Expression)
    # 5: IO (Input/Output), 6: CD (Conditional), 7: LO (Loop)
    
    if t == "NumberNode" or t == "StringNode":
        concepts_found.add(1)  # CO
    elif t == "VarAssignNode" or t == "DictionaryNode" or t == "VarDeclNode":
        concepts_found.add(2)  # VA
    elif t == "BinaryOpNode" or t == "UnaryOpNode":
        concepts_found.add(3)  # OP
        concepts_found.add(4)  # EX
    elif t == "IfNode":
        concepts_found.add(6)  # CD
    elif t in ["WhileNode", "ForNode"]:
        concepts_found.add(7)  # LO
    elif t == "FunctionCallNode":
        call_name = node.get("call", {}).get("name") if isinstance(node.get("call"), dict) else node.get("call")
        if call_name in ["read", "write", "print"]:
            concepts_found.add(5)  # IO
        else:
            concepts_found.add(4)  # EX
            
    # Recurse into all dictionary values
    for v in node.values():
        get_present_concepts(v, concepts_found)
        
    return concepts_found

def get_pmatrix_from_ast(buggy_ast: dict, reference_asts: list[dict], q_matrix: list[int]) -> list[int]:
    """
    Computes the student's P-matrix by checking if the required concepts in the Q-Matrix
    are actually present in the student's AST.
    This is much more robust than strict structural diffing which penalizes alternative implementations.
    """
    present = get_present_concepts(buggy_ast)
    
    p_matrix = q_matrix.copy()
    for i in range(len(q_matrix)):
        if q_matrix[i] == 1:
            # Concept indices are 1-based in `present`
            if (i + 1) not in present:
                p_matrix[i] = 0
                
    return p_matrix

if __name__ == "__main__":
    current_dir = Path(__file__).parent
    data_dir = current_dir / "data"
    qmatrix_path = current_dir.parent.parent / "HELP-DKT" / "Code_HELP_DKT" / "data" / "ModelInput" / "problemQmatrix.CSV"
    generate_pmatrix_file(data_dir, qmatrix_path)

