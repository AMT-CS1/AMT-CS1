# HASIL DARI EMBEDDING

RINGKASAN
Total baris     : 56
Sukses          : 56
Gagal           : 0
Total token     : 1822
Waktu total     : 45.73s
Rata-rata/baris : 0.82s
Disimpan ke     : scripts/rag/result/misconceptions.parquet

RINGKASAN
Total baris     : 71
Sukses          : 71
Gagal           : 0
Total token     : 2924
Waktu total     : 60.94s
Rata-rata/baris : 0.86s
Disimpan ke     : scripts/rag/result/misconceptions_new.parquet

RINGKASAN
Total baris     : 71
Sukses          : 71
Gagal           : 0
Total token     : 6014
Waktu total     : 52.62s
Rata-rata/baris : 0.74s
Disimpan ke     : scripts/rag/result/misconception_expand.parquet

RINGKASAN
Total baris     : 71
Sukses          : 0
Gagal           : 71
Total token     : 0
Waktu total     : 37.82s
Rata-rata/baris : 0.53s
Disimpan ke     : scripts/rag/result/misconception_google_gemini_embedding_001.parquet

PERHATIAN: 71 baris gagal (status='error', embedding=None).
Baris ini tetap masuk parquet -- cek kolom error_message untuk detail.

gagal karena ada logic yang membatasi panjang embedding

RINGKASAN
Total baris     : 71
Sukses          : 71
Gagal           : 0
Total token     : 6637
Waktu total     : 39.78s
Rata-rata/baris : 0.56s
Disimpan ke     : scripts/rag/result/misconception_google_gemini_embedding_001.parquet

logic yang membatasi dihapus, selanjutnya store ke db maka yang terjadi adalah
sqlalchemy.exc.DBAPIError: (sqlalchemy.dialects.postgresql.asyncpg.Error) <class 'asyncpg.exceptions.DataError'>: expected 1536 dimensions, not 3072

Keputusan mustahil jika dimensi yang dihasilkan model lebih besar dari yang mampu di simpan vector
Bisa saja menggunakan vector dengan dimensi yang lebih besar, tapi tidak bisa menggunakan pencarian dengan HNSW

RINGKASAN
Total query     : 5
Total token     : 461
Disimpan ke     : scripts/rag/test/query_test_result_gemini_embedding_001.txt

hasil dari query test gemini embbeding

RINGKASAN
Total baris     : 71
Sukses          : 71
Gagal           : 0
Total token     : 5902
Waktu total     : 74.01s
Rata-rata/baris : 1.04s
Disimpan ke     : scripts/rag/result/misconception_3072_gemini_embedding_001.parquet

embedding setelah dibenarkan fieldnya

RINGKASAN
Model            : openai/text-embedding-3-large (3072 dim)
Total baris      : 418
Sukses           : 418
Gagal            : 0
Total token      : 100304
Estimasi biaya   : $0.013040
Waktu total      : 408.48s
Rata-rata/baris  : 0.98s
Disimpan ke      : scripts/rag/result/query_openai_embedding_large.parquet
