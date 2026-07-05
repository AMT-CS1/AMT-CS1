"""
Mesin diff & repair AST — otaknya deteksi miskonsepsi.

Alur besarnya gini:
1. Kode DAP di-compile jadi AST JSON (get_ast / misconception.generate_ast_json).
2. AST dinormalisasi (normalize_ast): variabel sekali-pakai di-inline biar
   beda gaya nulis gak dianggap beda logika.
3. AST siswa di-diff lawan AST solusi referensi (diff_and_repair). Tiap
   perbedaan dicatat, dan pola kesalahan yang dikenali dikasih label kode
   miskonsepsi (misal OP-1, VA-7, CD-13).

Kode miskonsepsi yang dipakai di file ini:
- CO-1: nge-assign ke nilai literal (nganggep angka itu variabel)
- CO-2: nge-reassign konstanta
- VA-2: assignment kebalik (a <- b padahal harusnya b <- a)
- VA-7: ketuker huruf besar-kecil nama variabel
- OP-1: pakai assignment (<-) di kondisi, harusnya perbandingan (=)
- CD-13: pakai `if` padahal butuh `while`
- LO-10: pakai `while` padahal cukup `if`
"""
import copy
import csv
import functools
import json
import os
import subprocess
import uuid
from pathlib import Path
from typing import Any


@functools.cache
def get_dap_path() -> str | None:
    """Nyari lokasi executable compiler DAP.

    Urutan nyarinya: env var DAP_PATH dulu, terus ~/.dap/bin/dap.exe,
    terakhir coba binary `dap` yang ada di PATH. Hasilnya di-cache
    (functools.cache) biar gak nyari ulang tiap dipanggil.
    """
    env_path = os.environ.get("DAP_PATH")
    if env_path and Path(env_path).exists():
        return env_path

    dap_exe = Path.home() / ".dap" / "bin" / "dap.exe"
    if dap_exe.exists():
        return str(dap_exe)

    try:
        subprocess.run(
            ["dap", "-h"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=1
        )
        return "dap"
    except Exception:
        pass

    return None


def count_var_references(node: Any, name: str) -> int:
    """Ngitung (secara rekursif) berapa kali satu nama variabel dipakai di subtree."""
    if not isinstance(node, dict):
        if isinstance(node, list):
            return sum(count_var_references(item, name) for item in node)
        return 0

    count = 0
    t = node.get("type")
    if t == "VarAccessToken" and node.get("name") == name:
        count += 1
    elif t == "VarAssignNode" and node.get("name") == name:
        count += 1

    for k, v in node.items():
        if k not in ["type", "name"]:
            count += count_var_references(v, name)
    return count


def collect_var_counts(node: Any, counts: dict[str, int] | None = None) -> dict[str, int]:
    """Kayak count_var_references, tapi sekali jalan langsung ngitung SEMUA
    variabel sekaligus — lebih hemat daripada nyusurin subtree berkali-kali."""
    if counts is None:
        counts = {}
    if isinstance(node, list):
        for item in node:
            collect_var_counts(item, counts)
        return counts
    if not isinstance(node, dict):
        return counts

    t = node.get("type")
    if t in ("VarAccessToken", "VarAssignNode"):
        name = node.get("name")
        if name:
            counts[name] = counts.get(name, 0) + 1

    for k, v in node.items():
        if k not in ("type", "name"):
            collect_var_counts(v, counts)
    return counts


def replace_var_reference(node: Any, name: str, replacement_value: dict[str, Any]) -> None:
    """Ganti semua pemakaian variabel `name` (VarAccessToken) dengan nilai
    penggantinya, langsung di tempat (in-place). Dipakai pas nge-inline variabel."""
    if not isinstance(node, dict):
        if isinstance(node, list):
            for idx, item in enumerate(node):
                if isinstance(item, dict) and item.get("type") == "VarAccessToken" and item.get("name") == name:
                    node[idx] = copy.deepcopy(replacement_value)
                else:
                    replace_var_reference(item, name, replacement_value)
        return

    for k, v in list(node.items()):
        if isinstance(v, dict) and v.get("type") == "VarAccessToken" and v.get("name") == name:
            node[k] = copy.deepcopy(replacement_value)
        else:
            replace_var_reference(v, name, replacement_value)


def normalize_ast(node: Any) -> Any:
    """Normalisasi AST secara rekursif — kerjaan utamanya nge-inline variabel
    yang cuma dipakai sekali.

    Contoh: `x <- a + b` terus `write x` bakal dilipat jadi `write (a + b)`.
    Tujuannya biar dua kode yang logikanya sama tapi gayanya beda (pakai
    variabel perantara vs langsung) keliatan identik pas di-diff, jadi siswa
    gak dicap salah cuma gara-gara beda gaya nulis.
    """
    if not isinstance(node, dict):
        if isinstance(node, list):
            for item in node:
                normalize_ast(item)
        return node

    # Normalisasi anak-anaknya dulu, baru node ini sendiri.
    for k, v in list(node.items()):
        if k != "type":
            normalize_ast(v)

    t = node.get("type")
    if t == "ListNode":
        program = node.get("program", [])
        # Hitung pemakaian variabel sekali jalan per statement (deklarasi di
        # DictionaryNode di-skip), biar gak perlu nyusurin ulang semua
        # statement lain tiap ketemu assignment.
        counters: list[dict[str, int]] = []
        for stmt in program:
            if isinstance(stmt, dict) and stmt.get("type") != "DictionaryNode":
                counters.append(collect_var_counts(stmt))
            else:
                counters.append({})
        total: dict[str, int] = {}
        for c in counters:
            for name, cnt in c.items():
                total[name] = total.get(name, 0) + cnt

        new_program = []
        prev: dict[str, int] = {}
        for i, stmt in enumerate(program):
            cur = counters[i]
            if isinstance(stmt, dict) and stmt.get("type") == "VarAssignNode":
                var_name = stmt.get("name")
                # ref_count = berapa kali variabel ini dipakai SETELAH baris ini
                # (total dikurangi pemakaian sebelum & di baris ini sendiri).
                ref_count = (
                    total.get(var_name, 0) - prev.get(var_name, 0) - cur.get(var_name, 0)
                )
                if ref_count == 1 and prev.get(var_name, 0) == 0:
                    # Kandidat inline: dipakai cuma sekali setelahnya dan belum
                    # pernah disentuh sebelumnya. Ganti pemakaian itu dengan nilainya.
                    for j in range(i + 1, len(program)):
                        if counters[j].get(var_name, 0):
                            replace_var_reference(program[j], var_name, stmt.get("value"))
                            # Statement targetnya berubah — hitung ulang counter-nya.
                            new_counts = collect_var_counts(program[j])
                            for name in set(counters[j]) | set(new_counts):
                                total[name] = (
                                    total.get(name, 0)
                                    - counters[j].get(name, 0)
                                    + new_counts.get(name, 0)
                                )
                            counters[j] = new_counts
                            break
                    # Buang assignment-nya dari program + kurangi sumbangannya ke total.
                    for name, cnt in cur.items():
                        total[name] = total.get(name, 0) - cnt
                    continue
            new_program.append(stmt)
            for name, cnt in cur.items():
                prev[name] = prev.get(name, 0) + cnt
        node["program"] = new_program

    return node


def cleanup_dictionary_node(root_node: dict[str, Any]) -> None:
    """Buang deklarasi variabel di DictionaryNode yang gak pernah dipakai di
    bagian algorithm — biasanya sisa dari variabel yang udah ke-inline sama
    normalize_ast. Konstanta (is_const) gak ikut dibuang."""
    if not isinstance(root_node, dict) or root_node.get("type") != "ListNode":
        return

    # Pisahin DictionaryNode (deklarasi) dari statement algorithm lainnya.
    dict_node = None
    algo_nodes = []
    for stmt in root_node.get("program", []):
        if isinstance(stmt, dict) and stmt.get("type") == "DictionaryNode":
            dict_node = stmt
        else:
            algo_nodes.append(stmt)
            
    if not dict_node:
        return
        
    # Hitung pemakaian tiap variabel yang dideklarasi; yang gak kepakai dibuang.
    variables = dict_node.get("variables", [])
    new_variables = []
    for var in variables:
        var_name = var.get("name")
        is_const = var.get("is_const", False)
        count = sum(count_var_references(node, var_name) for node in algo_nodes)
        if count > 0 or is_const:
            new_variables.append(var)
    dict_node["variables"] = new_variables


_reference_ast_cache: dict[tuple[str, bool], dict[str, Any]] = {}


def get_ast(filepath: str | Path, normalize: bool = True) -> dict[str, Any]:
    """Jalanin compiler DAP ke sebuah file, terus balikin AST-nya (JSON yang
    udah di-parse). File referensi (namanya diawali 'c_') hasilnya di-cache
    biar gak compile ulang tiap kali dibandingin."""
    filepath_str = str(filepath)
    filename = Path(filepath_str).name
    cache_key = (filepath_str, normalize)
    if filename.startswith("c_") and cache_key in _reference_ast_cache:
        # Balikin salinan (deepcopy) biar isi cache-nya gak ke-mutasi caller.
        return copy.deepcopy(_reference_ast_cache[cache_key])

    dap_bin = get_dap_path()
    if not dap_bin:
        raise FileNotFoundError(
            "DAP compiler binary not found. Please install DAP first."
        )

    cmd = [dap_bin, filepath_str, "--show-ast-json"]
    result = subprocess.run(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Failed to generate AST for {filepath_str}. Error:\n{result.stderr}"
        )

    # Ambil bagian JSON-nya doang dari stdout compiler.
    stdout = result.stdout.strip()
    try:
        ast_data = json.loads(stdout)
        if normalize:
            ast_data = normalize_ast(ast_data)
            cleanup_dictionary_node(ast_data)
        if filename.startswith("c_"):
            _reference_ast_cache[cache_key] = copy.deepcopy(ast_data)
        return ast_data
    except json.JSONDecodeError as e:
        raise ValueError(
            f"Could not parse DAP AST output as JSON. Output was:\n{stdout}\nError: {e}"
        )





def ast_to_code(node, indent=""):
    """Nerjemahin node AST balik jadi kode DAP yang rapi. Dipakai buat
    nampilin potongan kode di pesan miskonsepsi (buggy_expr/correct_expr)."""
    if not node:
        return ""
    t = node.get("type")

    if t == "ListNode":
        return "\n".join(
            ast_to_code(child, indent) for child in node.get("program", []) if child
        )

    elif t == "DictionaryNode":
        type_groups = {}
        for var in node.get("variables", []):
            is_const = var.get("is_const", False)
            if is_const:
                val = ast_to_code(var.get("value"))
                type_groups[f"const {var['name']} = {val}"] = []
            else:
                type_name = var.get("value", {}).get("name", "integer")
                if type_name not in type_groups:
                    type_groups[type_name] = []
                type_groups[type_name].append(var["name"])

        lines = []
        for type_name, names in type_groups.items():
            if not names:
                lines.append(f"{indent}    {type_name}")
            else:
                lines.append(f"{indent}    {', '.join(names)} : {type_name}")
        return f"{indent}dictionary\n" + "\n".join(lines)

    elif t == "VarAssignNode":
        return f"{indent}{node['name']} <- {ast_to_code(node['value'])}"

    elif t == "BinOpNode":
        left = ast_to_code(node["left"])
        right = ast_to_code(node["right"])
        return f"({left} {node['operator']} {right})"

    elif t == "UnaryOpNode":
        return f"{node['operator']}{ast_to_code(node['node'])}"

    elif t == "NumberNode":
        return node["value"]

    elif t == "StringNode":
        val = node["value"]
        if not val.startswith('"'):
            val = f'"{val}"'
        return val

    elif t == "VarAccessToken":
        return node["name"]

    elif t == "CallNode":
        call_name = node["call"]["name"]
        args_str = ", ".join(ast_to_code(arg) for arg in node.get("args", []))
        return f"{indent}{call_name} {args_str}"

    elif t == "IfNode":
        if_str = ""
        for idx, case in enumerate(node.get("cases", [])):
            cond = ast_to_code(case["condition"])
            body = ast_to_code(case["body"], indent + "    ")
            if idx == 0:
                if_str += f"{indent}if {cond} then\n{body}\n"
            else:
                if_str += f"{indent}elseif {cond} then\n{body}\n"

        else_case = node.get("else_case")
        if else_case and else_case.get("body"):
            else_body = ast_to_code(else_case["body"], indent + "    ")
            if_str += f"{indent}else\n{else_body}\n"

        if_str += f"{indent}endif"
        return if_str

    elif t == "WhileNode":
        cond = ast_to_code(node["condition"])
        body = ast_to_code(node["body"], indent + "    ")
        return f"{indent}while {cond} do\n{body}\n{indent}endwhile"

    return ""


def ast_to_full_dap(root_node, program_name="AutoRepaired"):
    """Bungkus statement-statement AST jadi satu program DAP utuh
    (program ... dictionary ... algorithm ... endprogram)."""
    dict_node = None
    algo_nodes = []

    for stmt in root_node.get("program", []):
        if not stmt:
            continue
        if stmt.get("type") == "DictionaryNode":
            dict_node = stmt
        else:
            algo_nodes.append(stmt)

    code = f"program {program_name}\n"
    if dict_node:
        code += ast_to_code(dict_node, "") + "\n"
    code += "algorithm\n"
    for stmt in algo_nodes:
        code += ast_to_code(stmt, "    ") + "\n"
    code += "endprogram"
    return code


def node_similarity(b_node, c_node, code_cache=None):
    """Ngasih skor kemiripan struktur antara dua node AST, dari 0.0 (beda
    total) sampai 1.0 (sama persis). Skor ini dipakai align_lists buat
    masang-masangin statement siswa dengan statement referensi."""
    if not isinstance(b_node, dict) or not isinstance(c_node, dict):
        return 1.0 if b_node == c_node else 0.0

    b_type = b_node.get("type")
    c_type = c_node.get("type")

    if b_type != c_type:
        if (b_type in ["IfNode", "WhileNode", "ForNode"]) and (c_type in ["IfNode", "WhileNode", "ForNode"]):
            return 0.3
        return 0.0

    if b_type == "VarAssignNode":
        return 1.0 if b_node.get("name") == c_node.get("name") else 0.5
    elif b_type == "CallNode":
        b_name = b_node.get("call", {}).get("name") if isinstance(b_node.get("call"), dict) else None
        c_name = c_node.get("call", {}).get("name") if isinstance(c_node.get("call"), dict) else None
        return 1.0 if b_name == c_name else 0.5
    elif b_type in ["IfNode", "WhileNode", "ForNode"]:
        return 0.8
    elif b_type in ["BinOpNode", "UnaryOpNode", "NumberNode", "StringNode", "VarAccessToken"]:
        if code_cache is None:
            return 1.0 if ast_to_code(b_node) == ast_to_code(c_node) else 0.5
        for n in (b_node, c_node):
            if id(n) not in code_cache:
                code_cache[id(n)] = ast_to_code(n)
        return 1.0 if code_cache[id(b_node)] == code_cache[id(c_node)] else 0.5

    return 0.5


def align_lists(buggy_list, correct_list):
    """Masang-masangin statement di kode siswa (buggy_list) dengan statement
    di solusi referensi (correct_list), pakai dua putaran greedy:
    pasangan yang kuat (skor >= 0.8) diambil duluan, baru pasangan struktural
    yang lebih lemah (>= 0.3). Urutan gini penting biar statement yang gak
    nyambung gak "nyerobot" pasangan yang harusnya cocok.
    Balikin: (matches, unmatched_buggy, unmatched_correct)
    """
    matched_b = set()
    matched_c = set()
    matches = []
    # Cache hasil stringify node ekspresi; aman dipakai selama kedua list masih hidup.
    code_cache: dict[int, str] = {}

    for threshold in (0.8, 0.3):
        for c_idx, c_stmt in enumerate(correct_list):
            if c_idx in matched_c:
                continue
            best_b_idx = -1
            best_score = 0.0
            for b_idx, b_stmt in enumerate(buggy_list):
                if b_idx in matched_b:
                    continue
                score = node_similarity(b_stmt, c_stmt, code_cache)
                if score > best_score:
                    best_score = score
                    best_b_idx = b_idx
            if best_score >= threshold:
                matches.append((best_b_idx, c_idx))
                matched_b.add(best_b_idx)
                matched_c.add(c_idx)

    unmatched_buggy = [idx for idx in range(len(buggy_list)) if idx not in matched_b]
    unmatched_correct = [idx for idx in range(len(correct_list)) if idx not in matched_c]

    return matches, unmatched_buggy, unmatched_correct


def get_dictionary_vars(root_node):
    """Helper buat ngambil deklarasi variabel & konstanta dari bagian
    dictionary di solusi referensi. Dipakai buat ngecek misal siswa
    nge-reassign konstanta (miskonsepsi CO-2)."""
    if not isinstance(root_node, dict) or root_node.get("type") != "ListNode":
        return {}
    for stmt in root_node.get("program", []):
        if isinstance(stmt, dict) and stmt.get("type") == "DictionaryNode":
            return {var.get("name"): var for var in stmt.get("variables", []) if var.get("name")}
    return {}


def diff_and_repair(buggy, correct, edit_logs=None, in_condition=False, reference_dictionary=None):
    """Ini JANTUNG-nya deteksi miskonsepsi. Nge-diff dua AST secara rekursif,
    terus "nge-repair" AST buggy di tempat (in-place) biar sama dengan correct.

    Tiap perbaikan dicatat ke edit_logs; kalau pola kesalahannya cocok sama
    miskonsepsi yang udah dikenal (CD-13, OP-1, VA-2, VA-7, CO-1, CO-2, dst),
    entri log-nya dikasih label "misconception" — itu yang nanti dipetik
    detect_misconceptions() buat ditampilin ke siswa.

    Param penting:
    - in_condition: True kalau lagi di dalam kondisi if/while — konteks ini
      dipakai buat ngenalin miskonsepsi kayak OP-1 (nulis assignment di kondisi).
    - reference_dictionary: daftar variabel/konstanta dari solusi referensi,
      buat ngecek reassign konstanta (CO-2).
    """
    if not isinstance(buggy, dict) or not isinstance(correct, dict):
        return False

    repaired = False

    # Di level root program, ambil dulu daftar variabel dari dictionary referensi.
    if reference_dictionary is None and correct.get("type") == "ListNode":
        reference_dictionary = get_dictionary_vars(correct)

    # Tipe node-nya beda total? Ganti buggy dengan salinan dari correct.
    if buggy.get("type") != correct.get("type"):
        misconception_data = None

        # Cek CD-13: siswa nganggep statement if bisa berulang kayak loop
        # (nulis `if` padahal harusnya `while`).
        if buggy.get("type") == "IfNode" and correct.get("type") == "WhileNode":
            misconception_data = {
                "code": "CD-13",
                "title": "If Statement Used Instead of Loop",
                "description": "Used an 'if' conditional branch where a repeating 'while' loop was required."
            }
        # Kebalikannya (LO-10): nulis `while` padahal cukup `if` sekali jalan.
        elif buggy.get("type") == "WhileNode" and correct.get("type") == "IfNode":
            misconception_data = {
                "code": "LO-10",
                "title": "Loop Used Instead of Conditional",
                "description": "Used a repeating 'while' loop where a single 'if' conditional branch was required."
            }
            
        # Cek OP-1: nulis assignment (<-) di dalam kondisi, padahal
        # maksudnya perbandingan (=).
        if in_condition and buggy.get("type") == "VarAssignNode":
            misconception_data = {
                "code": "OP-1",
                "title": "Using Assignment Instead of Comparison",
                "description": "Used the assignment operator (<-) instead of the equality comparison operator (=) inside a condition."
            }

        if edit_logs is not None:
            log_entry = {
                "type": "structural_mismatch",
                "buggy_expr": ast_to_code(buggy),
                "correct_expr": ast_to_code(correct),
                "detail": f"Expected node type '{correct.get('type')}', but found '{buggy.get('type')}'",
            }
            if misconception_data:
                log_entry["misconception"] = misconception_data
            edit_logs.append(log_entry)
        for k in list(buggy.keys()):
            del buggy[k]
        # Wajib deepcopy: pohon hasil repair gak boleh nunjuk (alias) ke
        # subtree AST referensi — edit in-place berikutnya bisa gak sengaja
        # ngubah referensinya kalau di-share.
        for k, v in correct.items():
            buggy[k] = copy.deepcopy(v)
        return True

    t = buggy.get("type")

    if t == "BinOpNode":
        if buggy.get("operator") != correct.get("operator"):
            old_op = buggy.get("operator")
            new_op = correct.get("operator")
            
            # Operator beda di dalam kondisi + operatornya '<-' = kasus OP-1
            # (ketuker antara assignment dan perbandingan).
            misconception_data = None
            if in_condition and old_op == "<-":
                misconception_data = {
                    "code": "OP-1",
                    "title": "Using Assignment Instead of Comparison",
                    "description": f"Used assignment operator '{old_op}' instead of comparison operator '{new_op}' inside a condition."
                }
                
            if edit_logs is not None:
                log_entry = {
                    "type": "operator_mismatch",
                    "buggy_expr": ast_to_code(buggy),
                    "correct_expr": ast_to_code(correct),
                    "detail": f"Comparison operator mismatch: expected '{new_op}', but found '{old_op}'",
                }
                if misconception_data:
                    log_entry["misconception"] = misconception_data
                edit_logs.append(log_entry)
            buggy["operator"] = correct["operator"]
            repaired = True
        repaired = (
            diff_and_repair(buggy.get("left"), correct.get("left"), edit_logs, in_condition, reference_dictionary)
            or repaired
        )
        repaired = (
            diff_and_repair(buggy.get("right"), correct.get("right"), edit_logs, in_condition, reference_dictionary)
            or repaired
        )

    elif t == "UnaryOpNode":
        if buggy.get("operator") != correct.get("operator"):
            old_op = buggy.get("operator")
            new_op = correct.get("operator")
            if edit_logs is not None:
                edit_logs.append(
                    {
                        "type": "operator_mismatch",
                        "buggy_expr": ast_to_code(buggy),
                        "correct_expr": ast_to_code(correct),
                        "detail": f"Unary operator mismatch: expected '{new_op}', but found '{old_op}'",
                    }
                )
            buggy["operator"] = correct["operator"]
            repaired = True
        repaired = (
            diff_and_repair(buggy.get("node"), correct.get("node"), edit_logs, in_condition, reference_dictionary)
            or repaired
        )

    elif t == "NumberNode" or t == "StringNode":
        if buggy.get("value") != correct.get("value"):
            old_val = buggy.get("value")
            new_val = correct.get("value")
            if edit_logs is not None:
                edit_logs.append(
                    {
                        "type": "value_mismatch",
                        "buggy_expr": ast_to_code(buggy),
                        "correct_expr": ast_to_code(correct),
                        "detail": f"Value mismatch: expected '{new_val}', but found '{old_val}'",
                    }
                )
            buggy["value"] = correct["value"]
            repaired = True

    elif t == "VarAccessToken":
        if buggy.get("name") != correct.get("name"):
            old_name = buggy.get("name")
            new_name = correct.get("name")

            # Nama variabelnya sama kalau huruf besar-kecilnya diabaikan?
            # Berarti siswa kejebak case-sensitivity (VA-7).
            misconception_data = None
            if old_name and new_name and old_name.lower() == new_name.lower():
                misconception_data = {
                    "code": "VA-7",
                    "title": "Case-Sensitivity Confusion",
                    "description": f"Variable names are case-sensitive. Used '{old_name}' instead of '{new_name}'."
                }
                
            if edit_logs is not None:
                log_entry = {
                    "type": "name_mismatch",
                    "buggy_expr": ast_to_code(buggy),
                    "correct_expr": ast_to_code(correct),
                    "detail": f"Variable name mismatch: expected '{new_name}', but found '{old_name}'",
                }
                if misconception_data:
                    log_entry["misconception"] = misconception_data
                edit_logs.append(log_entry)
            buggy["name"] = correct["name"]
            repaired = True

    elif t == "VarAssignNode":
        b_name = buggy.get("name")
        c_name = correct.get("name")

        misconception_data = None

        # Cek CO-1: nama variabelnya ternyata angka literal — siswa
        # nge-assign ke nilai literal seolah-olah itu variabel.
        is_numeric = False
        try:
            float(b_name)
            is_numeric = True
        except (TypeError, ValueError):
            pass

        if is_numeric:
            misconception_data = {
                "code": "CO-1",
                "title": "Assigning to a Literal Value",
                "description": f"Used a literal value '{b_name}' as if it were a variable assignment target."
            }
        # Cek CO-2: siswa nge-reassign sesuatu yang di referensi dideklarasi
        # sebagai konstanta — ketuker antara konstanta dan variabel.
        elif reference_dictionary and b_name in reference_dictionary:
            var_def = reference_dictionary[b_name]
            if var_def.get("is_const", False):
                misconception_data = {
                    "code": "CO-2",
                    "title": "Reassigning a Constant",
                    "description": f"Attempted to reassign or modify the constant variable '{b_name}'."
                }

        if b_name != c_name:
            # Cek VA-2: assignment-nya kebalik. Contoh: nulis `a <- b`
            # padahal harusnya `b <- a` — kiri-kanannya persis ketuker.
            b_val = buggy.get("value", {})
            c_val = correct.get("value", {})
            if (isinstance(b_val, dict) and b_val.get("type") == "VarAccessToken" and
                isinstance(c_val, dict) and c_val.get("type") == "VarAccessToken" and
                b_val.get("name") == c_name and c_val.get("name") == b_name):
                misconception_data = {
                    "code": "VA-2",
                    "title": "Commutative Assignment Confusion",
                    "description": f"Assignment statement is reversed. Wrote '{b_name} <- {c_name}' instead of '{c_name} <- {b_name}'."
                }
            # Cek VA-7: cuma beda huruf besar-kecil doang.
            elif b_name and c_name and b_name.lower() == c_name.lower():
                misconception_data = {
                    "code": "VA-7",
                    "title": "Case-Sensitivity Confusion",
                    "description": f"Variable names are case-sensitive. Used '{b_name}' instead of '{c_name}'."
                }

            if edit_logs is not None:
                log_entry = {
                    "type": "name_mismatch",
                    "buggy_expr": ast_to_code(buggy),
                    "correct_expr": ast_to_code(correct),
                    "detail": f"Assignment variable name mismatch: expected '{c_name}', but found '{b_name}'",
                }
                if misconception_data:
                    log_entry["misconception"] = misconception_data
                edit_logs.append(log_entry)
            buggy["name"] = correct["name"]
            repaired = True
        elif misconception_data is not None and edit_logs is not None:
            # Namanya sama, tapi assignment-nya sendiri udah salah kaprah
            # (misal nge-reassign konstanta) — tetep dilaporin, jangan dibuang.
            edit_logs.append({
                "type": "misconception",
                "buggy_expr": ast_to_code(buggy),
                "correct_expr": ast_to_code(correct),
                "detail": misconception_data["description"],
                "misconception": misconception_data,
            })
        repaired = (
            diff_and_repair(buggy.get("value"), correct.get("value"), edit_logs, in_condition, reference_dictionary)
            or repaired
        )

    elif t == "CallNode":
        repaired = (
            diff_and_repair(buggy.get("call"), correct.get("call"), edit_logs, in_condition, reference_dictionary)
            or repaired
        )
        if len(buggy.get("args", [])) == len(correct.get("args", [])):
            for b_arg, c_arg in zip(buggy.get("args", []), correct.get("args", [])):
                repaired = diff_and_repair(b_arg, c_arg, edit_logs, in_condition, reference_dictionary) or repaired

    elif t == "IfNode":
        if len(buggy.get("cases", [])) == len(correct.get("cases", [])):
            for b_case, c_case in zip(buggy.get("cases", []), correct.get("cases", [])):
                repaired = (
                    diff_and_repair(
                        b_case.get("condition"), c_case.get("condition"), edit_logs, in_condition=True, reference_dictionary=reference_dictionary
                    )
                    or repaired
                )
                repaired = (
                    diff_and_repair(b_case.get("body"), c_case.get("body"), edit_logs, in_condition=False, reference_dictionary=reference_dictionary)
                    or repaired
                )
        if buggy.get("else_case") and correct.get("else_case"):
            repaired = (
                diff_and_repair(
                    buggy["else_case"].get("body"),
                    correct["else_case"].get("body"),
                    edit_logs,
                    in_condition=False,
                    reference_dictionary=reference_dictionary,
                )
                or repaired
            )

    elif t == "WhileNode":
        repaired = (
            diff_and_repair(buggy.get("condition"), correct.get("condition"), edit_logs, in_condition=True, reference_dictionary=reference_dictionary)
            or repaired
        )
        repaired = (
            diff_and_repair(buggy.get("body"), correct.get("body"), edit_logs, in_condition=False, reference_dictionary=reference_dictionary)
            or repaired
        )

    elif t == "ListNode":
        # Level daftar statement: pasang-pasangkan dulu statement siswa vs
        # referensi, baru diff yang berpasangan dan catat sisanya.
        b_list = buggy.get("program", [])
        c_list = correct.get("program", [])
        matches, unmatched_b, unmatched_c = align_lists(b_list, c_list)

        repaired_flag = False

        # Diff/repair statement yang dapet pasangan.
        for b_idx, c_idx in matches:
            if diff_and_repair(b_list[b_idx], c_list[c_idx], edit_logs, in_condition, reference_dictionary):
                repaired_flag = True

        # Ada yang gak berpasangan = ada statement kelebihan/kurang.
        if unmatched_b or unmatched_c:
            repaired_flag = True

        # Catat statement KELEBIHAN (ada di kode siswa, gak ada di referensi).
        for b_idx in unmatched_b:
            b_stmt = b_list[b_idx]
            if edit_logs is not None:
                log_entry = {
                    "type": "extra_statement",
                    "buggy_expr": ast_to_code(b_stmt),
                    "correct_expr": "",
                    "detail": f"Extra statement: found '{ast_to_code(b_stmt)}' which is not needed"
                }
                # Statement kelebihan yang isinya nge-assign ke konstanta = CO-2.
                if isinstance(b_stmt, dict) and b_stmt.get("type") == "VarAssignNode":
                    stmt_name = b_stmt.get("name")
                    if (reference_dictionary and stmt_name in reference_dictionary
                            and reference_dictionary[stmt_name].get("is_const", False)):
                        log_entry["misconception"] = {
                            "code": "CO-2",
                            "title": "Reassigning a Constant",
                            "description": f"Attempted to reassign or modify the constant variable '{stmt_name}'."
                        }
                edit_logs.append(log_entry)

        # Catat statement yang HILANG (ada di referensi, gak ada di kode siswa).
        for c_idx in unmatched_c:
            c_stmt = c_list[c_idx]
            if edit_logs is not None:
                edit_logs.append({
                    "type": "missing_statement",
                    "buggy_expr": "",
                    "correct_expr": ast_to_code(c_stmt),
                    "detail": f"Missing statement: expected to find '{ast_to_code(c_stmt)}'"
                })

        # Susun ulang program hasil repair ngikutin urutan referensi.
        new_program = []
        matched_map = {c_idx: b_list[b_idx] for b_idx, c_idx in matches}
        for c_idx, c_stmt in enumerate(c_list):
            if c_idx in matched_map:
                new_program.append(matched_map[c_idx])
            else:
                new_program.append(copy.deepcopy(c_stmt))
                
        buggy["program"] = new_program
        repaired = repaired_flag or repaired

    elif t == "DictionaryNode":
        if len(buggy.get("variables", [])) == len(correct.get("variables", [])):
            for b_var, c_var in zip(
                buggy.get("variables", []), correct.get("variables", [])
            ):
                repaired = diff_and_repair(b_var, c_var, edit_logs, in_condition, reference_dictionary) or repaired

    return repaired


def get_challenge_id(filename: str) -> str:
    """Ngambil id soal dari nama file. Contoh: 'b_p1_student01.dap' -> 'p1'."""
    parts = filename.split("_")
    if len(parts) > 1:
        return parts[1].replace(".dap", "")
    return filename.replace("b_", "").replace("c_", "").replace(".dap", "")


def find_reference_files(buggy_filename: str, directory: str | Path) -> list[str]:
    """Nyari semua file solusi referensi (prefix 'c_') yang cocok buat satu soal."""
    challenge_id = get_challenge_id(buggy_filename)

    directory_path = Path(directory)
    references = []
    if directory_path.exists() and directory_path.is_dir():
        for f in directory_path.iterdir():
            # Cocokinnya harus persis per segmen id, biar 'p1' gak ikut kena 'p10'.
            if f.is_file() and f.name.startswith("c_") and get_challenge_id(f.name) == challenge_id:
                references.append(str(f))
    return references


def find_reference_file(buggy_filename: str, directory: str | Path) -> str | None:
    """Sama kayak find_reference_files, tapi cuma ngambil yang pertama ketemu."""
    refs = find_reference_files(buggy_filename, directory)
    return refs[0] if refs else None


def execute_dap_with_input(filepath: str | Path, inputs: list[str]) -> tuple[str, str]:
    """Jalanin file DAP dengan input dari stdin, balikin (stdout, stderr).
    Ada timeout 3 detik biar program yang muter terus (infinite loop) gak ngegantung."""
    dap_bin = get_dap_path()
    if not dap_bin:
        return "", "DAP bin missing"

    filepath_str = str(filepath)
    try:
        process = subprocess.Popen(
            [dap_bin, filepath_str],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr = process.communicate(input="\n".join(inputs) + "\n", timeout=3)
        return stdout.strip(), stderr.strip()
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        return "", "Timeout"


