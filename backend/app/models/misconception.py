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

    # Auto-increment integer: miskonsepsi tidak lagi punya kode tetap macam
    # "VA-1"/"LO-2" — sekarang digenerate LLM dan terus bertambah, jadi cukup
    # nomor urut otomatis sebagai identitas.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    
    # Deskripsi miskonsepsinya (kolom "Misconception" di excel).
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # Contoh kesalahan konkret (kolom "Example"). Boleh kosong — beberapa entri
    # di bahan awal memang belum punya contoh.
    example: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Tag Knowledge Component terkait, comma-separated (mis. "CD,EX,OP").
    # Dipakai buat pre-filter kandidat sebelum vector search, biar top-k lebih
    # on-point (soal loop -> cukup cari di entri ber-tag LO). Selaras dengan
    # 7 konsep AMT-CS1: CO, VA, OP, EX, IO, CD, LO.
    kc_tags: Mapped[str] = mapped_column(String(100), nullable=False, default="")

    # Asal-usul entri (provenance). Buat data awal dari paper: mis.
    # "McMining 4; Qian 19". Buat entri hasil LLM: "llm-generated".
    source: Mapped[str] = mapped_column(String(255), nullable=False, default="llm-generated")

    # Vektor embedding hasil API. Dimensi 1536 ngikutin curated_cases
    # (standar OpenAI text-embedding-3-small). GANTI kalau provider embedding
    # yang dipakai beda dimensi (Voyage/Cohere/Gemini dsb) — kolom Vector(N)
    # itu fixed, salah pilih berarti migrasi ulang.
    embedding: Mapped[list[float]] = mapped_column(Vector(1536), nullable=False)