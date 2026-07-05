"""
Jembatan antara pipeline submit jawaban (routers/attempts.py) dan mesin
deteksi miskonsepsi DAP (app/DAP/repair.py).

Isinya dua kerjaan utama:
- generate_ast_json: nge-compile kode DAP siswa jadi AST JSON lewat flag
  --show-ast-json punya compiler (cuma sekali per submission; AST-nya langsung
  disimpan, jadi compiler gak perlu dipanggil ulang buat kode yang sama).
- detect_misconceptions: bandingin AST siswa vs AST solusi referensi, terus
  balikin daftar miskonsepsi yang siap disimpan ke DB dan ditampilin ke siswa.
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


def _generate_ast_json_sync(code: str, timeout: float = 5.0, normalize: bool = True) -> dict | None:
    # Compiler DAP cuma bisa baca dari file, jadi kode siswa ditulis dulu ke
    # file sementara, di-compile, terus filenya dihapus lagi di blok finally.
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
            # Kodenya gagal compile — gak usah diapa-apain, balikin None aja.
            return None

        ast = json.loads(result.stdout.strip())
        # Normalisasi (inline variabel sekali-pakai) dipakai buat diffing AST.
        # Tapi caller yang butuh kode apa adanya — misal deteksi kehadiran
        # konsep buat P-Matrix — harus matiin ini (normalize=False), soalnya
        # inlining bikin assignment sekali-pakai "hilang" dari AST.
        if normalize:
            ast = repair.normalize_ast(ast)
            repair.cleanup_dictionary_node(ast)
        return ast
    except Exception as e:
        logger.warning("AST generation failed: %s", e)
        return None
    finally:
        # Bersih-bersih file sementara, apapun yang terjadi di atas.
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass


async def generate_ast_json(code: str, timeout: float = 5.0, normalize: bool = True) -> dict | None:
    """
    Nge-compile kode DAP jadi AST JSON. Kalau gagal (apapun sebabnya) balikin None.

    normalize=True (default): variabel sekali-pakai di-inline, cocok buat
    diffing struktur. Pakai normalize=False kalau butuh AST persis seperti
    yang ditulis siswa — dipakai deteksi kehadiran konsep, biar assignment
    macam `sum <- a + b + c` gak dilipat/hilang.

    Compile-nya jalan di thread terpisah (anyio) biar gak nge-block event loop.
    """
    return await anyio.to_thread.run_sync(_generate_ast_json_sync, code, timeout, normalize)


def detect_misconceptions_best(student_ast: dict, reference_asts: list[dict]) -> list[dict] | None:
    """
    Bandingin AST siswa dengan SEMUA kandidat solusi referensi, terus ambil
    hasil dari referensi yang paling "deket" (jumlah perbedaan logikanya
    paling sedikit). Ide dasarnya: satu soal bisa punya banyak cara jawab yang
    benar, jadi jangan hukum siswa cuma karena gayanya beda sama satu referensi.

    Balikin None kalau gak ada kandidat referensi sama sekali.
    """
    best: list[dict] | None = None
    for reference_ast in reference_asts:
        detected = detect_misconceptions(student_ast, reference_ast)
        if best is None or len(detected) < len(best):
            best = detected
        if best == []:
            break  # Strukturnya udah identik sama salah satu referensi — gak bakal lebih deket lagi.
    return best


def detect_misconceptions(student_ast: dict, reference_ast: dict) -> list[dict]:
    """
    Bandingin AST siswa vs AST solusi referensi, balikin list entri
    {code, title, description, detail, buggy_expr}.

    Yang penting: correct_expr SENGAJA gak diikutkan — hint yang tampil ke
    siswa gak boleh ngebocorin solusi referensinya.
    """
    try:
        edit_logs: list[dict] = []
        # diff_and_repair itu ngubah AST-nya langsung (in-place), jadi wajib
        # di-deepcopy dulu biar AST asli siswa & referensinya gak kesentuh.
        buggy = copy.deepcopy(student_ast)
        correct = copy.deepcopy(reference_ast)
        repair.diff_and_repair(buggy, correct, edit_logs=edit_logs)

        # Ambil cuma log edit yang ada label miskonsepsinya, terus dedup
        # biar miskonsepsi yang sama gak muncul dobel di UI.
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
                dedupe_key = f"{entry['code']}|{entry['detail']}"
                if dedupe_key in seen_codes:
                    continue
                seen_codes.add(dedupe_key)
                results.append(entry)
        return results
    except Exception as e:
        # Deteksi miskonsepsi itu fitur "bonus" — kalau error, jangan sampai
        # bikin submission siswa ikut gagal. Cukup di-log terus balikin kosong.
        logger.warning("Misconception detection failed: %s", e)
        return []
