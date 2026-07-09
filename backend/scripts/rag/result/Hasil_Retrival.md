# Evaluasi Retrieval — RAG Misconception Detection
 
**Model embedding:** `openai/text-embedding-3-small`
**Top-K:** 5
**Tanggal run:** 2026-07-08
 
---
 
## Ringkasan Hasil
 
| Query | Expected Code | Ditemukan di Top-5? | Rank | Kode yang Match | Similarity | Distance |
|---|---|---|---|---|---|---|
| 1 | `OP-01` | ❌ Tidak | - | - | - | - |
| 2 | `CD-01` | ✅ Ya | 4 | `CD-01` | 0.430090 | 0.569910 |
| 3 | `LO-14` | ❌ Tidak | - | - | - | - |
| 4 | `VA-06` | ✅ Ya | 2 | `VA-06` | 0.464904 | 0.535096 |
| 5 | `SQ-01` | ❌ Tidak | - | - | - | - |
 
**Hit@5: 2/5 (40%)** — jawaban benar muncul di top-5 hasil retrieval untuk 2 dari 5 query.
**Hit@1: 0/5 (0%)** — tidak ada jawaban benar yang berhasil nangkring tepat di rank 1.
**MRR (Mean Reciprocal Rank): 0.15** — rata-rata skor 1/rank dari semua query (0 jika miss); makin dekat ke 1.0 makin bagus posisinya, 0.15 tergolong rendah.

# Evaluasi Retrieval — RAG Misconception Detection
 
**Model embedding:** `google/gemini-embedding-001`
**Top-K:** 5
**Tanggal run:** 2026-07-09
 
---
 
## Ringkasan Hasil
 
| Query | Expected Code | Ditemukan di Top-5? | Rank | Kode yang Match | Similarity | Distance |
|---|---|---|---|---|---|---|
| 1 | `OP-01` | ❌ Tidak | - | - | - | - |
| 2 | `CD-01` | ✅ Ya | 1 | `CD-01` | 0.794320 | 0.205680 |
| 3 | `LO-14` | ❌ Tidak | - | - | - | - |
| 4 | `VA-06` | ✅ Ya | 1 | `VA-06` | 0.773666 | 0.226334 |
| 5 | `SQ-01` | ❌ Tidak | - | - | - | - |
 
**Hit@5: 2/5 (40%)** — jawaban benar muncul di top-5 hasil retrieval untuk 2 dari 5 query.
**Hit@1: 2/5 (40%)** — jawaban benar berhasil nangkring tepat di rank 1 untuk 2 dari 5 query.
**MRR (Mean Reciprocal Rank): 0.40** — rata-rata skor 1/rank dari semua query (0 jika miss); makin dekat ke 1.0 makin bagus posisinya.