# Fitur Deteksi Miskonsepsi + P/Q Matrix

Dokumen ini ngejelasin gimana sistem "nebak" letak salah paham (miskonsepsi) siswa
dari kode DAP yang mereka submit, plus gimana P-Matrix dan Q-Matrix dihitung.
Bahasanya santai aja biar gampang dicerna. 😄

## Gambaran Besar

Tiap siswa submit jawaban, sistem gak cuma bilang "benar/salah" — dia juga:

1. **Ngebedah kode siswa jadi AST** (pohon sintaks) pakai compiler DAP.
2. **Bandingin AST itu dengan solusi referensi** buat nyari pola kesalahan yang
   udah dikenal (miskonsepsi), misalnya nulis `if` padahal harusnya `while`.
3. **Ngitung P-Matrix vs Q-Matrix** — konsep apa yang diwajibkan soal vs konsep
   apa yang beneran muncul di kode siswa.
4. **Nampilin hasilnya ke siswa** sebagai "Logic Hints" + tawaran kuis konsep,
   dan **nyatet ke log** buat di-review peneliti/rater.

## Peta File

| File | Perannya |
|---|---|
| [backend/app/routers/attempts.py](../backend/app/routers/attempts.py) | Pintu masuknya. Endpoint `POST /attempts` yang ngerangkai semua langkah di bawah. |
| [backend/app/core/misconception.py](../backend/app/core/misconception.py) | Jembatan: compile kode → AST, terus manggil mesin diff. |
| [backend/app/DAP/repair.py](../backend/app/DAP/repair.py) | Mesinnya. Normalisasi AST, diff & repair, dan pelabelan kode miskonsepsi. |
| [backend/app/DAP/build_pmatrix.py](../backend/app/DAP/build_pmatrix.py) | Ngitung P-Matrix: konsep mana yang beneran dipakai siswa. |
| [frontend/app/(student)/student/StudentWorkspace.tsx](../frontend/app/(student)/student/StudentWorkspace.tsx) | UI siswa: kartu "Logic Hints", ajakan hint quiz, dan review setelah deadline. |
| [frontend/components/rater/MisconceptionReview.tsx](../frontend/components/rater/MisconceptionReview.tsx) | UI rater: validasi manual hasil deteksi otomatis. |

## 7 Konsep (Knowledge Components)

Semua vektor matrix panjangnya 7, urutannya SELALU begini:

| Slot | Kode | Artinya |
|---|---|---|
| 1 | CO | Constant — nilai literal/konstanta |
| 2 | VA | Variable — assignment variabel |
| 3 | OP | Operation — operator (+, -, dst) |
| 4 | EX | Expression — ekspresi/pemanggilan fungsi |
| 5 | IO | Input/Output — `read`, `write`, `print` |
| 6 | CD | Conditional — `if`/`elseif`/`else` |
| 7 | LO | Loop — `while`/`for` |

## Alur Lengkap `POST /attempts`

Semua ini kejadian di `create_attempt()` di [attempts.py](../backend/app/routers/attempts.py):

1. **Kode dievaluasi** dulu lawan test case (DAP runner). Hasilnya:
   `success` (kompile jalan?) dan `passed` (semua test case lulus?).
2. **AST di-compile sekali** lewat `generate_ast_json()` terus disimpan ke MinIO
   (`*.ast.json`). Analisis berikutnya tinggal baca, gak perlu compile ulang.
3. **Kandidat referensi dikumpulin**: solusi resmi soal + submission siswa lain
   yang udah lulus (disimpan otomatis tiap ada yang lulus — makin lama makin
   banyak variasi jawaban benar, makin adil perbandingannya).
4. **Kalau jawaban salah** → `detect_misconceptions_best()` diff AST siswa lawan
   SEMUA kandidat, terus ambil hasil dari referensi yang paling mirip (perbedaan
   paling sedikit). Ini biar siswa yang jawabannya "beda gaya" gak dihukum.
5. **Q-Matrix dibangun** dari `kc_tags` di row soal (misal `"VA,OP,IO"` →
   `[0,1,1,0,1,0,0]`).
6. **P-Matrix dihitung**:
   - Gagal compile → semua slot wajib dinolkan (dianggap gagal semua).
   - Compile jalan → `get_pmatrix_from_ast()` ngecek tiap konsep wajib beneran
     ada gak di AST siswa. Yang gak ketemu, dinolkan + dilaporin sebagai
     miskonsepsi `XX-MISSING` dan submission dianggap gagal.
   - Konsep lengkap tapi test case gagal → semua slot wajib tetep dinolkan
     (konsepnya ada tapi pemakaiannya masih salah).
7. **Cosine similarity** P vs Q dihitung; `matrix_similar = (similarity >= 0.70)`.
8. **Semuanya disimpan**: attempt (kolom `misconceptions` di Postgres), log
   `submission`, dan log `misconception` buat riset. Response ke frontend bawa
   `misconceptions`, `p_matrix`, `q_matrix`, `matrix_similar`.

## Gimana Diff AST-nya Kerja ([repair.py](../backend/app/DAP/repair.py))

### Langkah 1: Normalisasi (`normalize_ast`)

Variabel yang cuma dipakai sekali di-inline. Contoh:

```
x <- a + b      →      write (a + b)
write x
```

Tujuannya: dua kode yang logikanya sama tapi gaya nulisnya beda keliatan identik
pas di-diff. `cleanup_dictionary_node` terus buang deklarasi variabel yang jadi
gak kepakai (kecuali konstanta).

> ⚠️ **Penting:** buat ngecek kehadiran konsep (P-Matrix), yang dipakai justru
> AST **mentah** (`normalize=False`). Soalnya kalau `sum <- a + b + c` udah
> ke-inline ke dalam `write`, konsep VA-nya "hilang" dan siswa dituduh gak
> pakai variabel padahal pakai.

### Langkah 2: Penjajaran statement (`align_lists`)

Statement siswa dipasang-pasangkan dengan statement referensi pakai skor
kemiripan (`node_similarity`, 0.0–1.0) dalam dua putaran greedy: pasangan kuat
(≥ 0.8) diklaim duluan, baru yang lemah (≥ 0.3). Statement yang gak dapet
pasangan dicatat sebagai "kelebihan" atau "hilang".

### Langkah 3: Diff & repair (`diff_and_repair`)

AST siswa "diperbaiki" node demi node biar sama dengan referensi. Tiap perbaikan
dicatat ke `edit_logs`, dan kalau polanya cocok sama miskonsepsi yang dikenal,
log-nya dikasih label. Daftar kodenya:

| Kode | Nama santainya | Ketauan dari |
|---|---|---|
| CO-1 | Nge-assign ke angka | Nama variabel di assignment ternyata angka literal |
| CO-2 | Ngubah konstanta | Assignment ke nama yang di referensi dideklarasi `const` |
| VA-2 | Assignment kebalik | Nulis `a <- b` padahal harusnya `b <- a` |
| VA-7 | Ketuker huruf besar-kecil | Nama variabel cuma beda kapitalisasi |
| OP-1 | Assignment vs perbandingan | Ada `<-` di dalam kondisi if/while |
| CD-13 | `if` dikira bisa ngulang | Nulis `if` di posisi yang harusnya `while` |
| LO-10 | `while` padahal cukup `if` | Kebalikannya CD-13 |
| XX-MISSING | Konsep wajib gak ada | Dari cek P-Matrix, bukan dari diff (XX = CO/VA/dst) |
| GEN | Perbedaan logika umum | Perbedaan lain yang gak cocok pola manapun |

Hasil akhirnya di-dedup (kode + detail yang sama gak dobel) sama
`detect_misconceptions()` di [misconception.py](../backend/app/core/misconception.py).

> 🔒 **Aturan emas:** `correct_expr` (potongan solusi referensi) **gak pernah**
> dikirim ke siswa. Hint boleh nunjukin kode siswa yang salah, tapi gak boleh
> bocorin jawabannya.

## P-Matrix ([build_pmatrix.py](../backend/app/DAP/build_pmatrix.py))

Dua fungsi utama:

- `get_present_concepts(ast)` — jalan-jalan ke seluruh AST, nyatet konsep mana
  aja yang muncul (NumberNode → CO, VarAssignNode → VA, BinOpNode → OP + EX,
  `read`/`write`/`print` → IO, IfNode → CD, While/ForNode → LO).
- `get_pmatrix_from_ast(ast, refs, q_matrix)` — mulai dari salinan Q-Matrix,
  terus nolkan slot yang konsep wajibnya gak ketemu di AST siswa.

Pendekatan "cek kehadiran" ini sengaja dipilih daripada diffing ketat, biar
solusi alternatif yang valid gak dihukum.

Ada juga `detect_ast_failures()` (dipakai buat analisis offline) yang nge-diff
buggy vs correct dan metain kesalahan ke konsep. Triknya di **konteks**: operator
salah di dalam kondisi `if` dihitung kesalahan CD, di dalam `while` dihitung LO,
di luar itu baru OP.

## Sisi Frontend

**Siswa** ([StudentWorkspace.tsx](../frontend/app/(student)/student/StudentWorkspace.tsx)):
- Habis submit, response-nya dipajang: kartu **"Logic Hints"** (judul + kode
  miskonsepsi + deskripsi + `buggy_expr`).
- Jawaban salah (dan bukan mode lab/praktikum) → muncul ajakan **hint quiz**
  (Misconception Probe) buat ngecek konsepnya lebih dalam.
- `q_matrix` / `p_matrix` / `matrix_similar` saat ini cuma di-`console.log`
  buat debugging — belum ada UI khususnya.
- Setelah deadline, mode review nampilin miskonsepsi dari attempt terakhir.

**Rater** ([MisconceptionReview.tsx](../frontend/components/rater/MisconceptionReview.tsx)):
- Daftar attempt + miskonsepsinya, kode siswa, AST, dan solusi referensi —
  buat validasi manual: deteksi otomatisnya bener gak?

## Hal-Hal yang Sering Bikin Bingung

1. **Kenapa ada dua versi AST (normal & mentah)?** Normalisasi bagus buat diff
   (nyamain gaya nulis), tapi jelek buat cek kehadiran konsep (bikin VA hilang).
   Makanya `generate_ast_json()` punya parameter `normalize`.
2. **Kenapa `diff_and_repair` pakai deepcopy di mana-mana?** Karena dia ngedit
   AST langsung di tempat (in-place). Tanpa deepcopy, AST asli siswa atau
   referensi bisa ikut berubah — dan cache referensi jadi korup.
3. **Kenapa dibandingin ke banyak referensi?** Satu soal bisa dijawab banyak
   cara. Sistem ngambil referensi ter-mirip biar hint-nya relevan, bukan
   nyuruh siswa nulis ulang persis kayak satu solusi tertentu.
4. **Deteksi miskonsepsi gagal = submission gagal?** Nggak. Semua error di jalur
   miskonsepsi cuma di-log terus di-skip — fitur ini "bonus", gak boleh
   ngeganggu alur submit.
