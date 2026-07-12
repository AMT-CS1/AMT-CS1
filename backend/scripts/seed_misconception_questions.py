"""Seed the multiple-choice question bank for misconception remediation.

Each question is keyed by a misconception tag (LO, CD, VA, SQ). During remediation
the student is served one question per tag; a correct answer clears the tag, a wrong
answer serves a different question for the same tag — so several per tag are seeded.

Run after the migration:

    python -m scripts.seed_misconception_questions

Idempotent: upserts by (misconception_tag, text_en, code) — `code` is part of the
key because different questions can share the same prompt text (e.g. two
"what will be displayed?" trace questions with different pseudocode).
"""
import sys
import asyncio
import uuid
from pathlib import Path
from sqlalchemy import select, and_

backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.core.config import settings
from app.models.misconception_question import MisconceptionQuestion
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker


# answer_index is 0-based into the options lists.
QUESTIONS = [
    # ----------------- LO (Loops) -----------------
    {
        "misconception_tag": "LO",
        "text_en": "Which control structure should you use to repeat a block of code multiple times?",
        "text_id": "Struktur kontrol mana yang sebaiknya kamu gunakan untuk mengulang blok kode beberapa kali?",
        "code": None,
        "options_en": ["A loop (while / for)", "An if statement", "A single assignment", "A variable declaration"],
        "options_id": ["Sebuah loop (while / for)", "Sebuah pernyataan if", "Satu penugasan", "Deklarasi variabel"],
        "answer_index": 0,
        "explanation_en": "Repetition is done with a loop (while/for). An if only chooses whether to run a block once.",
        "explanation_id": "Pengulangan dilakukan dengan loop (while/for). if hanya memilih apakah blok dijalankan sekali.",
    },
    {
        "misconception_tag": "LO",
        "text_en": "What is the final value of total after this code runs with n = 3?",
        "text_id": "Berapa nilai akhir total setelah kode ini dijalankan dengan n = 3?",
        "code": "total <- 0\ni <- 1\nwhile i <= n do\n    total <- total + i\n    i <- i + 1\nendwhile",
        "options_en": ["6", "3", "0", "9"],
        "options_id": ["6", "3", "0", "9"],
        "answer_index": 0,
        "explanation_en": "The loop adds 1 + 2 + 3 = 6 across its three iterations.",
        "explanation_id": "Loop menambahkan 1 + 2 + 3 = 6 selama tiga iterasi.",
    },
    {
        "misconception_tag": "LO",
        "text_en": "Why does this loop never stop (infinite loop)?",
        "text_id": "Mengapa loop ini tidak pernah berhenti (loop tak terhingga)?",
        "code": "i <- 1\nwhile i <= n do\n    write i\nendwhile",
        "options_en": [
            "The counter i is never increased, so the condition stays true forever.",
            "n is never read from input.",
            "write i prints the wrong value.",
            "while loops are always infinite in DAP.",
        ],
        "options_id": [
            "Penghitung i tidak pernah dinaikkan, sehingga kondisi selalu benar selamanya.",
            "n tidak pernah dibaca dari input.",
            "write i menampilkan nilai yang salah.",
            "loop while selalu tak terhingga di DAP.",
        ],
        "answer_index": 0,
        "explanation_en": "Without i <- i + 1 inside the loop, i stays 1 and i <= n never becomes false.",
        "explanation_id": "Tanpa i <- i + 1 di dalam loop, i tetap 1 dan i <= n tidak pernah menjadi salah.",
    },
    # ----------------- CD (Conditionals) -----------------
    {
        "misconception_tag": "CD",
        "text_en": "Which statement runs a block of code only when a condition is true?",
        "text_id": "Pernyataan mana yang menjalankan blok kode hanya ketika suatu kondisi benar?",
        "code": None,
        "options_en": ["An if statement", "A while loop", "A read statement", "A constant declaration"],
        "options_id": ["Pernyataan if", "Loop while", "Pernyataan read", "Deklarasi konstanta"],
        "answer_index": 0,
        "explanation_en": "An if statement conditionally executes its block once. A while loop repeats while the condition holds.",
        "explanation_id": "Pernyataan if menjalankan bloknya sekali secara bersyarat. Loop while mengulang selama kondisi benar.",
    },
    {
        "misconception_tag": "CD",
        "text_en": "What does this code output when x = 7?",
        "text_id": "Apa keluaran kode ini ketika x = 7?",
        "code": "if x % 2 == 0 then\n    write \"Even\"\nelse\n    write \"Odd\"\nendif",
        "options_en": ["Odd", "Even", "7", "Nothing"],
        "options_id": ["Odd", "Even", "7", "Tidak ada"],
        "answer_index": 0,
        "explanation_en": "7 % 2 is 1 (not 0), so the else branch runs and prints \"Odd\".",
        "explanation_id": "7 % 2 adalah 1 (bukan 0), jadi cabang else berjalan dan menampilkan \"Odd\".",
    },
    {
        "misconception_tag": "CD",
        "text_en": "You need to pick between two different actions based on a condition. What do you use?",
        "text_id": "Kamu perlu memilih antara dua tindakan berbeda berdasarkan suatu kondisi. Apa yang kamu gunakan?",
        "code": None,
        "options_en": ["if ... else", "A while loop", "A sequence of reads", "A constant"],
        "options_id": ["if ... else", "Loop while", "Rangkaian read", "Sebuah konstanta"],
        "answer_index": 0,
        "explanation_en": "if ... else selects exactly one of two branches based on the condition.",
        "explanation_id": "if ... else memilih tepat satu dari dua cabang berdasarkan kondisi.",
    },
    # ----------------- VA (Variables) -----------------
    {
        "misconception_tag": "VA",
        "text_en": "Why do you need a temporary variable to swap the values of two variables a and b?",
        "text_id": "Mengapa kamu memerlukan variabel sementara untuk menukar nilai dua variabel a dan b?",
        "code": None,
        "options_en": [
            "To avoid losing a's original value when it is overwritten by b.",
            "Because DAP requires at least three variables.",
            "To make the program run faster.",
            "It is not needed; a <- b then b <- a works.",
        ],
        "options_id": [
            "Untuk menghindari kehilangan nilai asli a ketika ditimpa oleh b.",
            "Karena DAP membutuhkan minimal tiga variabel.",
            "Agar program berjalan lebih cepat.",
            "Tidak diperlukan; a <- b lalu b <- a sudah cukup.",
        ],
        "answer_index": 0,
        "explanation_en": "Assigning a <- b first destroys a's value, so b <- a would just copy b back. A temp preserves the original.",
        "explanation_id": "Menugaskan a <- b lebih dulu menghapus nilai a, sehingga b <- a hanya menyalin b kembali. Variabel sementara menyimpan nilai asli.",
    },
    {
        "misconception_tag": "VA",
        "text_en": "What is the value of x after this code runs?",
        "text_id": "Berapa nilai x setelah kode ini dijalankan?",
        "code": "x <- 5\nx <- x + 3\nx <- x * 2",
        "options_en": ["16", "13", "10", "5"],
        "options_id": ["16", "13", "10", "5"],
        "answer_index": 0,
        "explanation_en": "x becomes 5, then 5 + 3 = 8, then 8 * 2 = 16.",
        "explanation_id": "x menjadi 5, lalu 5 + 3 = 8, lalu 8 * 2 = 16.",
    },
    {
        "misconception_tag": "VA",
        "text_en": "Which operator assigns a value to a variable in DAP pseudocode?",
        "text_id": "Operator mana yang menetapkan nilai ke variabel dalam pseudocode DAP?",
        "code": None,
        "options_en": ["<-", "==", ">=", "%"],
        "options_id": ["<-", "==", ">=", "%"],
        "answer_index": 0,
        "explanation_en": "The arrow <- assigns a value. == compares for equality.",
        "explanation_id": "Panah <- menetapkan nilai. == membandingkan kesamaan.",
    },
    # ----------------- SQ (Sequence) -----------------
    {
        "misconception_tag": "SQ",
        "text_en": "In what order are the statements of an algorithm executed by default?",
        "text_id": "Dalam urutan apa pernyataan sebuah algoritma dijalankan secara default?",
        "code": None,
        "options_en": ["From top to bottom, one after another", "From bottom to top", "In random order", "All at the same time"],
        "options_id": ["Dari atas ke bawah, satu per satu", "Dari bawah ke atas", "Dalam urutan acak", "Semua pada saat yang sama"],
        "answer_index": 0,
        "explanation_en": "Statements run sequentially from top to bottom unless a loop or conditional changes the flow.",
        "explanation_id": "Pernyataan berjalan secara berurutan dari atas ke bawah kecuali loop atau kondisional mengubah alurnya.",
    },
    {
        "misconception_tag": "SQ",
        "text_en": "Which statement must come first when computing a result from input?",
        "text_id": "Pernyataan mana yang harus muncul lebih dulu saat menghitung hasil dari input?",
        "code": "(1) write result\n(2) result <- a + b\n(3) read a\n(4) read b",
        "options_en": ["(3) read a", "(2) result <- a + b", "(1) write result", "The order does not matter"],
        "options_id": ["(3) read a", "(2) result <- a + b", "(1) write result", "Urutannya tidak penting"],
        "answer_index": 0,
        "explanation_en": "You must read the inputs before you can use them, and compute before you write. Correct order: read, read, compute, write.",
        "explanation_id": "Kamu harus membaca input sebelum menggunakannya, dan menghitung sebelum menampilkan. Urutan benar: read, read, hitung, write.",
    },
    {
        "misconception_tag": "SQ",
        "text_en": "This code always prints 0. What is the ordering mistake?",
        "text_id": "Kode ini selalu menampilkan 0. Apa kesalahan urutannya?",
        "code": "total <- 0\nwrite total\ntotal <- total + n",
        "options_en": [
            "write happens before total is updated, so it prints the old value.",
            "total should be a constant.",
            "n must be printed instead of total.",
            "There is no mistake; it is correct.",
        ],
        "options_id": [
            "write terjadi sebelum total diperbarui, jadi menampilkan nilai lama.",
            "total seharusnya sebuah konstanta.",
            "n harus ditampilkan alih-alih total.",
            "Tidak ada kesalahan; sudah benar.",
        ],
        "answer_index": 0,
        "explanation_en": "The write runs before the update, so it prints 0. The update must come before the write.",
        "explanation_id": "write berjalan sebelum pembaruan, jadi menampilkan 0. Pembaruan harus dilakukan sebelum write.",
    },
    {
        "misconception_tag": "SQ",
        "text_en": "Consider the following pseudocode. What will be displayed?",
        "text_id": "Perhatikan pseudocode berikut. Apa yang akan ditampilkan?",
        "code": "program Akumulasi\nkamus\n    total : integer\nalgoritma\n    total <- 0\n    total <- total + 5\n    output(total)\n    total <- total + 3\n    output(total)\nendprogram",
        "options_en": ["5, 8", "8, 8", "0, 5", "Don't know"],
        "options_id": ["5, 8", "8, 8", "0, 5", "Tidak tahu"],
        "answer_index": 0,
        "explanation_en": "Correct Answer -> A (5, 8) -> trace literal: total=5 at the first output, total=8 at the second output.\nPrimary Trigger -> B (8, 8) -> SQ-01 -> student thinks both outputs are only printed after all assignments are finished (final value).\nC (0, 5) -> SQ-01 -> student thinks each output captures the value before the assignment line above it, not after (one step lag).\nOther/Unknown -> D",
        "explanation_id": "Correct Answer -> A (5, 8) -> trace literal: total=5 saat output pertama, total=8 saat output kedua\nPrimary Trigger -> B (8, 8) -> SQ-01 -> siswa mengira kedua output baru tercetak setelah semua assignment selesai (nilai akhir)\nC (0, 5) -> SQ-01 -> siswa mengira tiap output menangkap nilai sebelum baris assignment di atasnya, bukan sesudahnya (lag satu langkah)\nOther/Unknown -> D",
    },
    {
        "misconception_tag": "SQ",
        "text_en": "Consider the following pseudocode. What will be displayed?",
        "text_id": "Perhatikan pseudocode berikut. Apa yang akan ditampilkan?",
        "code": "program TukarNilai\nkamus\n    a, b, temp : integer\nalgoritma\n    a <- 5\n    b <- 8\n    output(a)\n    output(b)\n    temp <- a\n    a <- b\n    b <- temp\nendprogram",
        "options_en": ["5, 8", "8, 5", "5, 5", "Don't know"],
        "options_id": ["5, 8", "8, 5", "5, 5", "Tidak tahu"],
        "answer_index": 0,
        "explanation_en": "Correct Answer -> A (5, 8) -> output occurs before the swap process is run.\nPrimary Trigger -> B (8, 5) -> SQ-01 -> student thinks output waits for the final result of the program (after swap is finished) to be printed.\nOther/Unknown -> C / D -> no clear cognitive reasoning, likely a guess or random error.",
        "explanation_id": "Correct Answer -> A (5, 8) -> output terjadi sebelum proses swap dijalankan\nPrimary Trigger -> B (8, 5) -> SQ-01 -> siswa mengira output menunggu hasil akhir program (setelah swap selesai) baru dicetak\nOther/Unknown -> C / D -> tidak ada reasoning kognitif yang jelas, kemungkinan besar tebakan/kekeliruan acak",
    },
]


db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)


async def main():
    engine = create_async_engine(db_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        print("Seeding misconception MC questions...")
        for q in QUESTIONS:
            res = await session.execute(select(MisconceptionQuestion).where(and_(
                MisconceptionQuestion.misconception_tag == q["misconception_tag"],
                MisconceptionQuestion.text_en == q["text_en"],
                MisconceptionQuestion.code == q["code"],
            )))
            row = res.scalar_one_or_none()
            if row is None:
                row = MisconceptionQuestion(id=uuid.uuid4())
                session.add(row)
                action = "Created"
            else:
                action = "Updated"
            row.misconception_tag = q["misconception_tag"]
            row.text_en = q["text_en"]
            row.text_id = q["text_id"]
            row.code = q["code"]
            row.options_en = q["options_en"]
            row.options_id = q["options_id"]
            row.answer_index = q["answer_index"]
            row.explanation_en = q["explanation_en"]
            row.explanation_id = q["explanation_id"]
            print(f"  {action} [{q['misconception_tag']}] {q['text_en'][:50]}...")

        await session.commit()
        print("Misconception MC questions seeding completed.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
