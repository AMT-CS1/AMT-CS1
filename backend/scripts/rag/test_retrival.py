"""
test_retrieval.py

Uji kualitas retrieval RAG misconception_catalog: embed satu/lebih query pakai
fungsi core yang sama dengan seeder (app.core.embeddings.get_embedding), lalu
cari top-k entri paling mirip (cosine similarity) di pgvector.

Metadata embedding QUERY juga dicatat (token_count, latency_ms, status) --
karena tiap query yang di-test juga makan biaya API, sama seperti saat build
katalognya.

Hasil disimpan sebagai JSON, isinya per query:
{
  "query": "...",
  "query_embedding_meta": {token_count, latency_ms, status, error_message},
  "top_k": [
    {"rank", "id", "description", "example", "kc_tags", "source", "similarity"},
    ...
  ]
}

Cara pakai (dari dalam container/venv backend):
    python scripts/rag/test_retrieval.py \
        --query "siswa pakai = di dalam kondisi if" \
        --query "siswa lupa endif" \
        --top-k 5 \
        --output scripts/rag/result/retrieval_report.json

Bisa juga baca query dari file teks (satu query per baris):
    python scripts/rag/test_retrieval.py --queries-file scripts/rag/data/test_queries.txt
"""
import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Tambahkan root backend/ ke sys.path -- naik dari lokasi file ini sampai
# ketemu folder yang punya subfolder "app/".
_current = Path(__file__).resolve().parent
while not (_current / "app").is_dir():
    if _current.parent == _current:
        raise RuntimeError("Tidak menemukan folder 'app/' di direktori manapun di atas script ini.")
    _current = _current.parent
sys.path.insert(0, str(_current))

from app.core.config import settings
from app.core.embeddings import get_embedding, MODEL_ID
from app.models.misconception import MisconceptionEntry

db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)


async def retrieve_top_k(session, query_embedding: list[float], top_k: int) -> list[dict]:
    """
    Cari top-k entri paling mirip lewat cosine DISTANCE pgvector (operator
    `<=>`, disediakan lewat method .cosine_distance() dari pgvector-sqlalchemy).
    Distance 0 = identik persis, distance besar = makin beda. Similarity
    dilaporkan sebagai (1 - distance) supaya lebih intuitif dibaca (1 = mirip
    sempurna, 0 = tak berkaitan).
    """
    distance_col = MisconceptionEntry.embedding.cosine_distance(query_embedding).label("distance")
    stmt = (
        select(MisconceptionEntry, distance_col)
        .order_by(distance_col)
        .limit(top_k)
    )
    result = await session.execute(stmt)
    rows = result.all()

    top_k_results = []
    for rank, (entry, distance) in enumerate(rows, start=1):
        top_k_results.append(
            {
                "rank": rank,
                "id": str(entry.id),
                "description": entry.description,
                "example": entry.example,
                "wrong_example": entry.wrong_example,
                "correct_example": entry.correct_example,
                "kc_tags": entry.kc_tags,
                "source": entry.source,
                "distance": round(float(distance), 6),
                "similarity": round(1 - float(distance), 6),
            }
        )
    return top_k_results


async def run_queries(queries: list[str], top_k: int) -> dict:
    engine = create_async_engine(db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    report = {
        "model": MODEL_ID,
        "top_k": top_k,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "results": [],
    }

    async with async_session() as session:
        for query in queries:
            print(f"\n>>> Query: {query}")

            # Embed query lewat fungsi core yang SAMA dengan seeder -- supaya
            # query & katalog berada di ruang vektor yang identik. Metadata
            # (token, latency) dicatat karena ini juga panggilan API berbayar.
            embed_result = await get_embedding(query)

            print(
                f"    embedding: status={embed_result.status} | "
                f"tokens={embed_result.token_count} | {embed_result.latency_ms}ms"
            )

            if embed_result.status != "ok":
                print(f"    -> GAGAL: {embed_result.error_message}")
                report["results"].append(
                    {
                        "query": query,
                        "query_embedding_meta": {
                            "token_count": embed_result.token_count,
                            "latency_ms": embed_result.latency_ms,
                            "status": embed_result.status,
                            "error_message": embed_result.error_message,
                        },
                        "top_k": [],
                    }
                )
                continue

            top_k_results = await retrieve_top_k(session, embed_result.embedding, top_k)

            for r in top_k_results:
                print(f"    [{r['rank']}] sim={r['similarity']:.4f} | {r['description'][:60]}...")

            report["results"].append(
                {
                    "query": query,
                    "query_embedding_meta": {
                        "token_count": embed_result.token_count,
                        "latency_ms": embed_result.latency_ms,
                        "status": embed_result.status,
                        "error_message": None,
                    },
                    "top_k": top_k_results,
                }
            )

    await engine.dispose()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--query",
        action="append",
        default=[],
        help="Satu query untuk diuji. Bisa dipakai berulang kali untuk beberapa query sekaligus.",
    )
    parser.add_argument(
        "--queries-file",
        default=None,
        help="Path ke file teks berisi satu query per baris (alternatif dari --query).",
    )
    parser.add_argument("--top-k", type=int, default=5, help="Jumlah hasil teratas (default: 5)")
    parser.add_argument(
        "--output",
        default="scripts/rag/result/retrieval_report.json",
        help="Path file JSON hasil laporan",
    )
    args = parser.parse_args()

    queries = list(args.query)
    if args.queries_file:
        if not os.path.exists(args.queries_file):
            print(f"ERROR: file queries tidak ditemukan: {args.queries_file}", file=sys.stderr)
            sys.exit(1)
        with open(args.queries_file, "r", encoding="utf-8") as f:
            content = f.read()
        # Satu BLOK (bisa multi-baris, mis. "problem + jawaban pseudocode
        # siswa") = satu query. Blok dipisah oleh baris berisi "---" saja --
        # bukan dipisah per baris, karena pseudocode punya banyak baris dan
        # tidak boleh terpotong jadi query-query yang salah.
        blocks = content.split("\n---\n")
        queries.extend(block.strip() for block in blocks if block.strip())

    if not queries:
        print("ERROR: tidak ada query. Pakai --query \"...\" atau --queries-file <path>.", file=sys.stderr)
        sys.exit(1)

    print(f"Menguji {len(queries)} query, top-k={args.top_k}")

    report = asyncio.run(run_queries(queries, args.top_k))

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    total_tokens = sum(
        r["query_embedding_meta"]["token_count"] or 0 for r in report["results"]
    )
    print("\n" + "=" * 60)
    print("RINGKASAN")
    print("=" * 60)
    print(f"Total query     : {len(queries)}")
    print(f"Total token     : {total_tokens}")
    print(f"Disimpan ke     : {args.output}")


if __name__ == "__main__":
    main()