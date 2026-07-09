"""
Katalog miskonsepsi untuk RAG (Retrieval-Augmented Generation).

Tabel ini adalah "kamus" semua miskonsepsi yang diketahui sistem. Isi awalnya
di-seed dari literatur (paper McMining, Qian, Sychev — lihat scripts/data/
bahan_rag.xlsx), dan ke depannya bertambah dari miskonsepsi yang digenerate LLM.

Saat siswa submit jawaban salah, deskripsi + contoh tiap entri dipakai sebagai
konteks yang di-retrieve (top-k paling mirip lewat cosine similarity di kolom
`embedding`) untuk disuntikkan ke prompt LLM — bareng closest-ref & problem+answer.

Berdiri sendiri tanpa foreign key: ini master/katalog referensi (seperti
curated_cases), bukan anak dari entitas lain. Satu entri bermakna penuh tanpa
perlu menempel ke user/attempt/problem tertentu.
"""
import uuid

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from app.models.base import Base


class MisconceptionEntry(Base):
    __tablename__ = "misconception_catalog"

    
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    example: Mapped[str | None] = mapped_column(Text, nullable=True)
    wrong_example: Mapped[str | None] = mapped_column(Text, nullable=True)
    correct_example: Mapped[str | None] = mapped_column(Text, nullable=True)
    kc_tags: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    source: Mapped[str] = mapped_column(String(255), nullable=False, default="llm-generated")
    embedding: Mapped[list[float]] = mapped_column(Vector(3072), nullable=False)