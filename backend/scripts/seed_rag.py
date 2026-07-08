"""
seed_rag.py

Baca misconceptions.parquet (hasil build_misconception_embedding.py, sudah
berisi embedding + metadata) lalu insert ke tabel misconception_catalog.

Script ini TIDAK memanggil API embedding sama sekali -- murni baca file lokal
lalu tulis ke Postgres. Jadi bebas dijalankan berulang kali, drop+reseed
sesuka hati, tanpa biaya API tambahan. Kalau butuh data baru, jalankan dulu
build_misconception_embedding.py untuk regenerate parquet-nya.

Baris dengan status != "ok" (embedding gagal dibuat) DILEWATI secara default --
tidak masuk ke database, karena embedding=None tidak bisa disimpan ke kolom
Vector(1536) yang NOT NULL.

Cara pakai (dari dalam container/venv backend):
    python scripts/rag/seed_rag.py \
        --input scripts/rag/result/misconceptions.parquet

    # reset dulu (hapus semua isi tabel) sebelum seed ulang:
    python scripts/rag/seed_rag.py --reset \
        --input scripts/rag/result/misconceptions.parquet
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Tambahkan root backend/ ke sys.path -- naik dari lokasi file ini sampai
# ketemu folder yang punya subfolder "app/", supaya tidak bergantung pada
# berapa level nested script ini ditaruh.
_current = Path(__file__).resolve().parent
while not (_current / "app").is_dir():
    if _current.parent == _current:
        raise RuntimeError("Tidak menemukan folder 'app/' di direktori manapun di atas script ini.")
    _current = _current.parent
sys.path.insert(0, str(_current))

from app.core.config import settings
from app.models.misconception import MisconceptionEntry

db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)


async def seed_rag(input_path: str, reset: bool = False):
    if not os.path.exists(input_path):
        print(f"ERROR: file parquet tidak ditemukan: {input_path}", file=sys.stderr)
        sys.exit(1)

    df = pd.read_parquet(input_path)
    print(f"Membaca {len(df)} baris dari {input_path}")

    # Pisahkan baris yang embeddingnya valid vs gagal (status != "ok").
    ok_df = df[df["status"] == "ok"].copy()
    skipped_df = df[df["status"] != "ok"]

    if len(skipped_df) > 0:
        print(f"\nMelewati {len(skipped_df)} baris berstatus non-'ok' (embedding tidak valid):")
        for _, row in skipped_df.iterrows():
            desc_preview = str(row["description"])[:50]
            print(f"  - source_no={row['source_no']}: {desc_preview}... ({row.get('error_message', 'unknown error')})")

    engine = create_async_engine(db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        if reset:
            print("\n--reset diberikan. Menghapus semua isi misconception_catalog...")
            await session.execute(delete(MisconceptionEntry))
            await session.commit()
            print("Tabel dikosongkan.")

        print(f"\nMenyisipkan {len(ok_df)} entri ke misconception_catalog...")
        inserted = 0
        for _, row in ok_df.iterrows():
            entry = MisconceptionEntry(
                description=row["description"],
                example=row["example"] if pd.notna(row["example"]) else None,
                kc_tags=row["kc_tags"] if pd.notna(row["kc_tags"]) else "",
                source=row["source"] if pd.notna(row["source"]) else "llm-generated",
                embedding=list(row["embedding"]),
            )
            session.add(entry)
            inserted += 1

        await session.commit()
        print(f"Selesai. {inserted} entri berhasil disisipkan.")

    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed misconception_catalog dari parquet hasil embedding.")
    parser.add_argument(
        "--input",
        default="scripts/rag/result/misconceptions.parquet",
        help="Path ke file parquet hasil build_misconception_embedding.py",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Hapus semua isi misconception_catalog sebelum insert (idempotent re-seed)",
    )
    args = parser.parse_args()
    asyncio.run(seed_rag(args.input, reset=args.reset))