"""
Bangun P-Matrix (Performance Matrix) siswa dari AST kodenya.

Intinya gini: tiap soal punya Q-Matrix — vektor 7 angka (0/1) yang nandain
konsep apa aja yang WAJIB ada buat nyelesain soal itu. Nah, P-Matrix itu
versi "kenyataannya": konsep mana aja yang BENERAN muncul di kode siswa.

Urutan 7 konsepnya (indeks 1-7):
1: CO (Constant)  2: VA (Variable)  3: OP (Operation)  4: EX (Expression)
5: IO (Input/Output)  6: CD (Conditional)  7: LO (Loop)
"""
import csv
from pathlib import Path
from typing import Any
try:
    from app.DAP import repair
except ImportError:
    # Fallback biar file ini tetep bisa dijalanin langsung (bukan lewat app).
    import repair

def detect_ast_failures(buggy, correct, current_context=None):
    """
    Nge-diff AST siswa (buggy) vs AST benar (correct) secara rekursif buat
    nyari konsep mana yang gagal. Balikin set indeks konsep yang gagal
    (1-indexed, urutannya: 1: CO, 2: VA, 3: OP, 4: EX, 5: IO, 6: CD, 7: LO).

    Trik utamanya di `context`: kesalahan yang sama bisa masuk konsep beda
    tergantung posisinya. Contoh: operator salah di dalam kondisi `if` itu
    dihitung kesalahan CD (Conditional), bukan OP — soalnya yang bermasalah
    itu logika kondisinya.
    """
    failed_concepts = set()
    if not isinstance(buggy, dict) or not isinstance(correct, dict):
        return failed_concepts

    t = buggy.get("type")

    # Simpan konteks sintaks biar kesalahan bisa dipetakan ke konsep yang pas.
    # Kalau lagi masuk ke dalam if/while/for/dictionary, semua kesalahan di
    # dalamnya "diwarnai" sama konteks itu.
    context = current_context
    if t in ["IfNode", "WhileNode", "ForNode", "DictionaryNode"]:
        context = t

    # 1. Tipe node-nya beda total (misal harusnya while tapi ditulis if).
    #    Konsep yang disalahin tergantung lagi ada di konteks apa.
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

    # 2. Tipenya sama, tapi isinya (value/nama/operator) yang beda.
    if t == "BinOpNode":
        if buggy.get("operator") != correct.get("operator"):
            # Operator salah di dalam kondisi = salah logika kondisi/loop,
            # bukan sekadar salah operator.
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
        # Field "call" kadang berupa dict {name: ...}, kadang string langsung —
        # dua-duanya di-handle di sini.
        call_name = buggy.get("call", {}).get("name") if isinstance(buggy.get("call"), dict) else buggy.get("call")
        correct_call_name = correct.get("call", {}).get("name") if isinstance(correct.get("call"), dict) else correct.get("call")
        # read/write/print itu fungsi I/O — kesalahannya masuk konsep IO.
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
            # Jumlah argumennya aja udah beda — langsung tandai gagal.
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
            # Jumlah cabang if/elseif-nya beda = logika kondisinya salah.
            failed_concepts.add(6) # CD

    elif t in ["WhileNode", "ForNode"]:
        failed_concepts.update(detect_ast_failures(buggy.get("condition"), correct.get("condition"), t))
        failed_concepts.update(detect_ast_failures(buggy.get("body"), correct.get("body"), t))

    elif t == "ListNode":
        b_prog = buggy.get("program", [])
        c_prog = correct.get("program", [])
        # Statement-nya dipasang-pasangkan dulu secara struktural, biar
        # statement yang hilang/kelebihan tetep kedeteksi — bukan malah
        # lolos begitu aja dan hasil vektornya keliatan bersih.
        matches, unmatched_b, unmatched_c = repair.align_lists(b_prog, c_prog)
        for b_idx, c_idx in matches:
            failed_concepts.update(detect_ast_failures(b_prog[b_idx], c_prog[c_idx], context))
        # Statement yang gak dapet pasangan (kelebihan di buggy, atau hilang
        # dari correct) langsung dipetakan ke konsep sesuai jenis statement-nya.
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
            # Jumlah deklarasi variabelnya beda = masalah di konsep Variable.
            failed_concepts.add(2) # VA

    return failed_concepts

def get_present_concepts(node: Any, concepts_found: set[int] = None) -> set[int]:
    """Jalan-jalan rekursif ke seluruh AST buat nyari konsep mana aja (dari 7)
    yang beneran DIPAKAI di kode siswa. Ini dasar buat ngisi P-Matrix."""
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
    #
    # CATATAN PENTING: nama-nama tipe di sini harus sama persis dengan yang
    # dikeluarin compiler DAP. VA cuma dihitung kalau ada assignment beneran
    # (VarAssignNode, contoh: `temp <- 5`), BUKAN deklarasi di dictionary
    # (VarDeclNode). Makanya fungsi ini butuh AST yang MENTAH alias belum
    # dinormalisasi — soalnya normalisasi nge-inline assignment sekali-pakai,
    # jadi assignment kayak `sum <- a + b + c` bakal "hilang" kelipat ke
    # dalam `write` dan VA-nya gak kedeteksi.
    if t in ("NumberNode", "StringNode", "BooleanNode"):
        concepts_found.add(1)  # CO
    elif t == "VarAssignNode":
        concepts_found.add(2)  # VA
    elif t in ("BinOpNode", "UnaryOpNode"):
        # Operasi biner/unary otomatis ngebuktiin dua konsep sekaligus:
        # operasinya sendiri (OP) dan ekspresinya (EX).
        concepts_found.add(3)  # OP
        concepts_found.add(4)  # EX
    elif t == "IfNode":
        concepts_found.add(6)  # CD
    elif t in ("WhileNode", "ForNode"):
        concepts_found.add(7)  # LO
    elif t == "CallNode":
        call_name = node.get("call", {}).get("name") if isinstance(node.get("call"), dict) else node.get("call")
        if call_name in ("read", "write", "print"):
            concepts_found.add(5)  # IO
        else:
            concepts_found.add(4)  # EX

    # Terusin nyusurin semua anak node-nya.
    for v in node.values():
        get_present_concepts(v, concepts_found)

    return concepts_found

def get_pmatrix_from_ast(buggy_ast: dict, reference_asts: list[dict], q_matrix: list[int]) -> list[int]:
    """
    Ngitung P-Matrix siswa: cek satu-satu konsep yang diwajibkan Q-Matrix,
    beneran ada gak di AST siswa. Kalau konsepnya wajib (q=1) tapi gak
    ketemu di kode, slot-nya dinolkan.

    Pendekatan "cek kehadiran konsep" ini jauh lebih adil dibanding diffing
    struktural yang ketat — soalnya diffing ketat bakal ngehukum siswa yang
    nulis solusi alternatif padahal jawabannya bener.
    """
    present = get_present_concepts(buggy_ast)

    p_matrix = q_matrix.copy()
    for i in range(len(q_matrix)):
        if q_matrix[i] == 1:
            # Indeks konsep di `present` itu 1-based, makanya i + 1.
            if (i + 1) not in present:
                p_matrix[i] = 0

    return p_matrix

def find_closest_reference(buggy_ast: dict, references: list[dict] ) -> str | None:
    """
    Extension: Closest Ref (AST + CL).

    Cari, dari N referensi solusi valid, SATU yang paling dekat secara
    struktural ke jawaban siswa. Dipakai buat nyuntikkan kode pembanding ke
    prompt LLM (bareng top-k miskonsepsi & problem+jawaban siswa)

    Balikin SOURCE CODE (pseudocode DAP, string) dari referensi ter-dekat.
    None kalau gak ada referensi sama sekali.
    """
    if not references:
        return None

    best_ref_code: str | None = None
    best_failures: set[int] | None = None

    for ref in references:
        failures = detect_ast_failures(buggy_ast, ref["ast"])
        if best_failures is None or len(failures) < len(best_failures):
            best_failures = failures
            best_ref_code = ref["code"]
            if not best_failures:
                break  # udah identik sempurna, gak bakal lebih deket lagi

    return best_ref_code