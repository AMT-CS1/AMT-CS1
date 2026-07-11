"""
run_retrieval_benchmark.py (retrival.py)

Baca query_embeddings.parquet (hasil build_query_embeddings.py -- embedding
query SUDAH ada, tidak perlu panggil API lagi di sini), cari top-k entri
paling mirip di tabel misconception_catalog (pgvector cosine distance),
simpan laporan sebagai CSV.

CATATAN: Tidak ada ground truth otomatis di sini. Sempat dicoba mencocokkan
`misconception_id` (penomoran McMining di file query) ke kolom `source`
katalog, tapi itu dihapus -- karena tidak ada jaminan semua misconception_id
di file query murni dari McMining (bisa saja campur Qian/Sychev yang
penomorannya sendiri-sendiri, berpotensi tabrakan nomor tanpa disadari).
Tanpa jaminan itu, klaim "benar/salah" jadi tidak bisa dipertanggungjawabkan.

Jadi output di sini murni DATA MENTAH: top-k hasil retrieval beserta
distance/similarity-nya. Penilaian relevan/tidaknya dilakukan manual, atau
ditambahkan lagi nanti kalau sudah ada pemetaan ground truth yang terjamin.

Cara pakai:
    docker exec amt-backend python scripts/rag/retrival.py \
        --input scripts/rag/result/query_openai_embedding_large.parquet \
        --top-k 5 \
        --output scripts/rag/result/retrival_openai_embedding_large.csv
"""
import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

_current = Path(__file__).resolve().parent
while not (_current / "app").is_dir():
    if _current.parent == _current:
        raise RuntimeError("Tidak menemukan folder 'app/' di direktori manapun di atas script ini.")
    _current = _current.parent
sys.path.insert(0, str(_current))

from app.core.config import settings


def resolve_db_url(cli_db_url: str | None) -> str:
    """Pakai --db-url kalau diisi, kalau tidak fallback ke settings.DATABASE_URL (database utama)."""
    url = cli_db_url or settings.DATABASE_URL
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


async def load_catalog_with_distances(engine, table: str, query_embedding: list[float]) -> list[dict]:
    """
    Ambil SEMUA entri katalog beserta cosine distance ke query_embedding,
    diurutkan dari paling dekat. Katalog kecil (puluhan baris) jadi ini murah.
    """
    vector_literal = "[" + ",".join(str(x) for x in query_embedding) + "]"
    query = text(f"""
        SELECT id, code, description, kc_tags, source,
               (embedding <=> CAST(:vec AS vector)) AS distance
        FROM {table}
        ORDER BY distance ASC
    """).bindparams(vec=vector_literal)

    async with engine.connect() as conn:
        result = await conn.execute(query)
        rows = result.mappings().all()
    return [dict(r) for r in rows]


async def run_benchmark(df: pd.DataFrame, db_url: str, table: str, top_k: int) -> list[dict]:
    engine = create_async_engine(db_url, echo=False)

    records = []
    for idx, row in df.iterrows():
        if row["status"] != "ok" or row["embedding"] is None:
            print(f"[SKIP] row.{idx} -- embedding query gagal sebelumnya (status={row['status']})")
            continue

        retrieval_start = time.perf_counter()
        sorted_catalog = await load_catalog_with_distances(engine, table, list(row["embedding"]))
        retrieval_latency_ms = round((time.perf_counter() - retrieval_start) * 1000, 2)

        print(
            f"row.{idx:>3} problem={row['problem_id']} misc_id={row['misconception_id']} "
            f"| retrieval={retrieval_latency_ms}ms | top1={sorted_catalog[0]['code'] if sorted_catalog else None}"
        )

        record = {
            "problem_id": row["problem_id"],
            "problem_title": row.get("problem_title"),
            "misconception_id": row["misconception_id"],
            "misconception_description": row.get("misconception_description"),
            "misconception_concept": row.get("misconception_concept"),
            "kc_target": row.get("kc_target"),
            "is_negative_control": row["is_negative_control"],
            "pseudocode_status": row["pseudocode_status"],
            "model": row["model"],
            "dimensions": row["dimensions"],
            "query_token_count": row["token_count"],
            "query_latency_ms": row["latency_ms"],
            "retrieval_latency_ms": retrieval_latency_ms,
            "top_k": top_k,
        }

        for rank in range(1, top_k + 1):
            if rank <= len(sorted_catalog):
                entry = sorted_catalog[rank - 1]
                record[f"top{rank}_code"] = entry["code"]
                record[f"top{rank}_description"] = entry["description"]
                record[f"top{rank}_kc_tags"] = entry["kc_tags"]
                record[f"top{rank}_distance"] = round(float(entry["distance"]), 6)
                record[f"top{rank}_similarity"] = round(1 - float(entry["distance"]), 6)
            else:
                record[f"top{rank}_code"] = None
                record[f"top{rank}_description"] = None
                record[f"top{rank}_kc_tags"] = None
                record[f"top{rank}_distance"] = None
                record[f"top{rank}_similarity"] = None

        records.append(record)

    await engine.dispose()
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Path ke parquet hasil build_query_embeddings.py")
    parser.add_argument("--db-url", default=None, help="Override koneksi DB (default: settings.DATABASE_URL)")
    parser.add_argument("--table", default="misconception_catalog", help="Nama tabel katalog (default: misconception_catalog)")
    parser.add_argument("--top-k", type=int, default=5, help="Jumlah hasil teratas yang dicatat (default: 5)")
    parser.add_argument("--output", default="scripts/rag/result/benchmark_report.csv", help="Path CSV hasil")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"ERROR: file input tidak ditemukan: {args.input}", file=sys.stderr)
        sys.exit(1)

    df = pd.read_parquet(args.input)
    db_url = resolve_db_url(args.db_url)

    print(f"Menguji {len(df)} query dari {args.input}")
    print(f"Target katalog: table={args.table}")
    print(f"Top-k: {args.top_k}\n")

    records = asyncio.run(run_benchmark(df, db_url, args.table, args.top_k))

    out_df = pd.DataFrame(records)
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    out_df.to_csv(args.output, index=False)

    print("\n" + "=" * 60)
    print("RINGKASAN")
    print("=" * 60)
    print(f"Total query diuji : {len(records)}")
    print(f"Disimpan ke       : {args.output}")


if __name__ == "__main__":
    main()