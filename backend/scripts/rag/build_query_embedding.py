"""
build_query_embeddings.py

Baca bahan_query.xlsx (418 baris: problem + jawaban siswa dalam Python DAN
pseudocode DAP hasil konversi, plus ground truth misconception_id), embed
tiap baris pakai app.core.embeddings.get_embedding() (model & dimensi diatur
dari default di core, TIDAK bisa di-override lewat CLI script ini -- ganti
MODEL_ID/EXPECTED_DIM di app/core/embeddings.py kalau mau ganti model).

Teks yang di-embed: problem_description_nonfunc + kode pseudocode. Untuk kode
pseudocode-nya:
- Kalau pseudocode_status == "converted" (kode benar-benar berhasil dikonversi
  DAN masih menunjukkan miskonsepsinya) -> pakai `pseudocode_code` (jawaban
  siswa yang buggy).
- Selain itu (none_inapplicable / not_manifestable, `pseudocode_code` selalu
  kosong untuk baris ini) -> fallback ke `answer_key_pseudocode` (kode benar).
  Baris ini otomatis jadi KONTROL NEGATIF: query dari kode benar, seharusnya
  TIDAK match kuat ke miskonsepsi manapun saat di-retrieve nanti.

Output parquet berisi SEMUA kolom asli dari excel + kolom metadata baru:
  query_text, embedded_text_len, is_negative_control,
  model, dimensions, embedding, token_count, latency_ms,
  http_status_code, is_truncated, estimated_cost_usd, status, error_message,
  embedded_at

Cara pakai:
    export OPEN_ROUTER_API_KEY=sk-or-...
    python scripts/rag/build_query_embeddings.py \
        --input scripts/rag/data/bahan_query.xlsx \
        --output scripts/rag/result/query_embeddings.parquet

    # coba dulu dengan subset kecil sebelum full-run (safety net biaya):
    python scripts/rag/build_query_embeddings.py --limit 5
"""
import argparse
import asyncio
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

# Tambahkan root backend/ ke sys.path -- naik dari lokasi file ini sampai
# ketemu folder yang punya subfolder "app/".
_current = Path(__file__).resolve().parent
while not (_current / "app").is_dir():
    if _current.parent == _current:
        raise RuntimeError("Tidak menemukan folder 'app/' di direktori manapun di atas script ini.")
    _current = _current.parent
sys.path.insert(0, str(_current))

from app.core.embeddings import get_embedding, MODEL_ID, EXPECTED_DIM

# Harga per 1 juta token input, USD (snapshot OpenRouter -- CEK ULANG BERKALA,
# harga bisa berubah). Estimasi biaya, bukan tagihan resmi.
PRICING_PER_MILLION_TOKENS = {
    "openai/text-embedding-3-small": 0.02,
    "openai/text-embedding-3-large": 0.13,
    "google/gemini-embedding-001": 0.15,
    "qwen/qwen3-embedding-8b": 0.01,
    "qwen/qwen3-embedding-4b": 0.02,
}

# Pola pesan error yang mengindikasikan input terpotong/kepanjangan (bukan
# ditolak diam-diam -- API embedding pada umumnya menolak dengan error kalau
# input melebihi context window, bukan memotong secara senyap).
TRUNCATION_ERROR_PATTERNS = ["maximum context length", "context length", "too long", "exceeds"]


def build_query_text(problem_description: str, code: str) -> str:
    """Gabungkan soal + kode jadi satu teks query, format konsisten dgn test_retrieval.py."""
    return f"Soal: {problem_description.strip()}\n\nJawaban:\n{code.strip()}"


def extract_http_status(status: str, error_message: str | None) -> int | None:
    """Ambil kode HTTP numerik dari error_message (format 'HTTP xxx: ...'), atau 200 kalau sukses."""
    if status == "ok":
        return 200
    if error_message:
        match = re.match(r"HTTP (\d+)", error_message)
        if match:
            return int(match.group(1))
    return None


def detect_truncation(error_message: str | None) -> bool:
    """Heuristik: True kalau error_message mengindikasikan input kepanjangan/terpotong."""
    if not error_message:
        return False
    lower = error_message.lower()
    return any(pattern in lower for pattern in TRUNCATION_ERROR_PATTERNS)


def estimate_cost(token_count: int | None, model: str) -> float | None:
    """Estimasi biaya USD = token_count / 1_000_000 * harga_per_juta_token. None kalau token_count tidak ada."""
    if token_count is None:
        return None
    price = PRICING_PER_MILLION_TOKENS.get(model)
    if price is None:
        return None
    return round((token_count / 1_000_000) * price, 8)


async def process_all(df: pd.DataFrame, api_key: str) -> tuple[list[dict], int, int, int, float]:
    records = []
    n_ok, n_error = 0, 0
    total_tokens = 0
    total_cost = 0.0

    for idx, row in df.iterrows():
        is_converted = row["pseudocode_status"] == "converted"
        is_negative_control = not is_converted

        # pseudocode_code selalu kosong untuk baris non-"converted" (sudah
        # diverifikasi: none_inapplicable & not_manifestable = 100% kosong).
        code = row["pseudocode_code"] if is_converted and pd.notna(row["pseudocode_code"]) else row["answer_key_pseudocode"]

        problem_desc = str(row["problem_description_nonfunc"]) if pd.notna(row["problem_description_nonfunc"]) else ""
        query_text = build_query_text(problem_desc, str(code))

        result = await get_embedding(query_text, api_key=api_key)  # model/dimensions pakai default dari core

        http_status = extract_http_status(result.status, result.error_message)
        is_truncated = detect_truncation(result.error_message)
        cost = estimate_cost(result.token_count, result.model)

        status_icon = "OK " if result.status == "ok" else "ERR"
        ctrl_tag = "NEG" if is_negative_control else "POS"
        print(
            f"[{status_icon}][{ctrl_tag}] row.{idx:>3} (problem {row['problem_id']}, misc {row['misconception_id']}) | "
            f"{result.latency_ms:>7.1f}ms | tokens={result.token_count} | http={http_status}"
        )
        if result.status == "ok":
            n_ok += 1
            total_tokens += result.token_count or 0
            total_cost += cost or 0.0
        else:
            n_error += 1
            print(f"        -> {result.error_message}")

        record = row.to_dict()
        record.update(
            {
                "query_text": query_text,
                "embedded_text_len": len(query_text),
                "is_negative_control": is_negative_control,
                "model": result.model,
                "dimensions": len(result.embedding) if result.embedding else None,
                "embedding": result.embedding,
                "token_count": result.token_count,
                "latency_ms": result.latency_ms,
                "http_status_code": http_status,
                "is_truncated": is_truncated,
                "estimated_cost_usd": cost,
                "status": result.status,
                "error_message": result.error_message,
                "embedded_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        records.append(record)

    return records, n_ok, n_error, total_tokens, total_cost


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="scripts/rag/data/bahan_query.xlsx", help="Path ke excel query")
    parser.add_argument("--output", default="scripts/rag/result/query_embeddings.parquet", help="Path parquet hasil")
    parser.add_argument("--limit", default=None, type=int, help="Batasi jumlah baris (buat uji coba sebelum full-run)")
    args = parser.parse_args()

    api_key = os.environ.get("OPEN_ROUTER_API_KEY")
    if not api_key:
        print("ERROR: env var OPEN_ROUTER_API_KEY belum di-set.", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(args.input):
        print(f"ERROR: file input tidak ditemukan: {args.input}", file=sys.stderr)
        sys.exit(1)

    df = pd.read_excel(args.input)
    required_cols = {
        "problem_id", "problem_description_nonfunc", "misconception_id",
        "pseudocode_status", "pseudocode_code", "answer_key_pseudocode",
    }
    missing = required_cols - set(df.columns)
    if missing:
        print(f"ERROR: kolom hilang di excel: {missing}", file=sys.stderr)
        sys.exit(1)

    if args.limit is not None:
        df = df.head(args.limit) 

    n_negative = (df["pseudocode_status"] != "converted").sum()
    n_positive = (df["pseudocode_status"] == "converted").sum()

    print(f"Memproses {len(df)} baris dari {args.input}")
    print(f"  -> {n_positive} baris positif (pseudocode_code, ada miskonsepsi)")
    print(f"  -> {n_negative} baris kontrol negatif (answer_key_pseudocode, kode benar)")
    print(f"Model: {MODEL_ID} (dimensi: {EXPECTED_DIM}) -- diatur dari app/core/embeddings.py\n")

    t_start_all = time.perf_counter()
    records, n_ok, n_error, total_tokens, total_cost = asyncio.run(process_all(df, api_key))
    total_elapsed = round(time.perf_counter() - t_start_all, 2)

    out_df = pd.DataFrame(records)
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    out_df.to_parquet(args.output, index=False)

    print("\n" + "=" * 60)
    print("RINGKASAN")
    print("=" * 60)
    print(f"Model            : {MODEL_ID} ({EXPECTED_DIM} dim)")
    print(f"Total baris      : {len(df)}")
    print(f"Sukses           : {n_ok}")
    print(f"Gagal            : {n_error}")
    print(f"Total token      : {total_tokens}")
    print(f"Estimasi biaya   : ${total_cost:.6f}")
    print(f"Waktu total      : {total_elapsed}s")
    print(f"Rata-rata/baris  : {round(total_elapsed / len(df), 2)}s")
    print(f"Disimpan ke      : {args.output}")
    if n_error:
        print(f"\nPERHATIAN: {n_error} baris gagal (status='error', embedding=None).")
        print("Baris ini tetap masuk parquet -- cek kolom error_message/http_status_code untuk detail.")


if __name__ == "__main__":
    main()