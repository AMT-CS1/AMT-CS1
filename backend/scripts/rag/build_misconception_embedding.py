"""
build_misconception_embeddings.py

Baca bahan_rag.xlsx (56 misconception dari McMining/Qian/Sychev), panggil
app.core.embeddings.get_embedding() untuk tiap baris, simpan HASIL EMBEDDING +
METADATA KUALITAS ke parquet.

Tujuan pemisahan tahap ini: script ini yang BAYAR (panggil API embedding),
seed_misconceptions.py nanti GRATIS (baca parquet, insert ke Postgres) --
jadi bisa drop/re-seed tabel sesuka hati tanpa biaya API berulang.

Dicatat per baris (untuk analisis kualitas & biaya):
- token_count       : usage.prompt_tokens dari response API
- latency_ms        : waktu tempuh satu panggilan API (ms)
- status            : "ok" / "error"
- error_message     : detail error kalau gagal
- embedded_text_len : panjang teks (karakter) yang di-embed
- model             : model id yang dipakai
- embedded_at       : timestamp UTC saat embedding dibuat

Cara pakai (dari dalam backend/, container atau venv):
    export OPEN_ROUTER_API_KEY=sk-or-...
    python scripts/build_misconception_embeddings.py \
        --input scripts/data/bahan_rag.xlsx \
        --output scripts/data/misconceptions.parquet

Kalau ada baris yang gagal (network/API error), script tetap lanjut ke baris
berikutnya; baris gagal itu tetap masuk parquet dengan status="error" dan
embedding=None -- biar kelihatan baris mana yang perlu di-retry, tanpa
mengulang baris yang sudah sukses (hemat biaya API).
"""
import argparse
import asyncio
import os
import sys
import time
from datetime import datetime, timezone

import pandas as pd

# Supaya bisa `import app.core.embeddings` saat dijalankan langsung dari
# folder scripts/, tambahkan root backend/ ke sys.path.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.core.embeddings import build_embedding_text, get_embedding, MODEL_ID, EXPECTED_DIM


async def process_all(df: pd.DataFrame, api_key: str) -> list[dict]:
    records = []
    n_ok, n_error = 0, 0
    total_tokens = 0

    for _, row in df.iterrows():
        no = row["No"]
        description = str(row["Misconception"]).strip()
        code = str(row["Code"]).strip() if pd.notna(row["Code"]) else None
        example = str(row["Example"]) if pd.notna(row["Example"]) else None
        wrong_example = str(row["Example"]) if pd.notna(row["Example"]) else None
        correct_example = str(row["Example"]) if pd.notna(row["Example"]) else None
        kc_tags = str(row["Concept"]).strip() if pd.notna(row["Concept"]) else ""
        source = str(row["Source ID(s)"]).strip() if pd.notna(row["Source ID(s)"]) else ""

        embed_text = build_embedding_text(description, example, wrong_example, correct_example)
        result = await get_embedding(embed_text, api_key=api_key)

        status_icon = "OK " if result.status == "ok" else "ERR"
        print(
            f"[{status_icon}] No.{no:>2} | {result.latency_ms:>7.1f}ms | "
            f"tokens={result.token_count} | {description[:50]}..."
        )

        if result.status == "ok":
            n_ok += 1
            total_tokens += result.token_count or 0
        else:
            n_error += 1
            print(f"        -> {result.error_message}")

        records.append(
            {
                "source_no": no,
                "code": code,
                "description": description,
                "example": example,
                "wrong_example": wrong_example,
                "correct_example": correct_example,
                "kc_tags": kc_tags,
                "source": source,
                "embedded_text_len": len(embed_text),
                "embedding": result.embedding,
                "token_count": result.token_count,
                "latency_ms": result.latency_ms,
                "status": result.status,
                "error_message": result.error_message,
                "model": result.model,
                "embedded_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    return records, n_ok, n_error, total_tokens


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="scripts/rag/data/bahan_rag.xlsx", help="Path ke excel sumber")
    parser.add_argument("--output", default="scripts/rag/result/misconceptions.parquet", help="Path parquet hasil")
    args = parser.parse_args()

    api_key = os.environ.get("OPEN_ROUTER_API_KEY")
    if not api_key:
        print("ERROR: env var OPEN_ROUTER_API_KEY belum di-set.", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(args.input):
        print(f"ERROR: file input tidak ditemukan: {args.input}", file=sys.stderr)
        sys.exit(1)

    df = pd.read_excel(args.input)
    required_cols = {"No", "Source ID(s)", "Concept", "Code", "Misconception", "Example", "Curation note", "wrong_example", "correct_example"}
    missing = required_cols - set(df.columns)
    if missing:
        print(f"ERROR: kolom hilang di excel: {missing}", file=sys.stderr)
        sys.exit(1)

    print(f"Memproses {len(df)} baris dari {args.input}")
    print(f"Model: {MODEL_ID} (target dim: {EXPECTED_DIM})\n")

    t_start_all = time.perf_counter()
    records, n_ok, n_error, total_tokens = asyncio.run(process_all(df, api_key))
    total_elapsed = round(time.perf_counter() - t_start_all, 2)

    out_df = pd.DataFrame(records)
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    out_df.to_parquet(args.output, index=False)

    print("\n" + "=" * 60)
    print("RINGKASAN")
    print("=" * 60)
    print(f"Total baris     : {len(df)}")
    print(f"Sukses          : {n_ok}")
    print(f"Gagal           : {n_error}")
    print(f"Total token     : {total_tokens}")
    print(f"Waktu total     : {total_elapsed}s")
    print(f"Rata-rata/baris : {round(total_elapsed / len(df), 2)}s")
    print(f"Disimpan ke     : {args.output}")
    if n_error:
        print(f"\nPERHATIAN: {n_error} baris gagal (status='error', embedding=None).")
        print("Baris ini tetap masuk parquet -- cek kolom error_message untuk detail.")


if __name__ == "__main__":
    main()