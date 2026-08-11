# Feature Plan — LMS Summary Report (feat/summary-reporting)

## Initial State

Given XLSX data exported from the LMS (Moodle) with 6 sheets:
`COURSES`, `PARTICIPANTS`, `QUIZ_LIST`, `QUESTION_BANK`, `PARTICIPANT_ATTEMPTS`, `RESPONSE_HISTORY`.

Sample file: `misc/Moodle_Quiz_Report_20260717_150343.xlsx`.

| Sheet | Grain (one row =) | Key columns |
|---|---|---|
| COURSES | one course | Fakultas, Prodi, Tahun_Ajar, Course_ID, Shortname, Fullname |
| PARTICIPANTS | one user-role per course | Course_ID, User_ID, Username, Firstname, Lastname, Email, Role_Shortname |
| QUIZ_LIST | one quiz | Course_ID, Quiz_ID, Quiz_Name, Open_Time, Close_Time, Time_Limit_Seconds, Max_Grade, Total_Questions |
| QUESTION_BANK | one slot in a quiz | Quiz_ID, Slot_Number, Question_ID, Question_Name, Question_Type, Question_Text (+ future: misconception Tag e.g. `VA-01`) |
| PARTICIPANT_ATTEMPTS | one **slot within an attempt** (attempt header repeats per row) | Quiz_ID, User_ID, Attempt_Number, Start/Finish, Attempt_Total_Grade, Slot_Number, Right_Answer, Student_Answer, Question_State, Question_Grade |
| RESPONSE_HISTORY | one step of one slot of one attempt | ...Attempt_Number, Slot_Number, Question_ID, Step, Time, Action, State, Marks, CodeRunner_Output |

## Goal

A summary report dashboard of LMS interactions:
- **Student view** — becomes the currently-placeholder **"My History"** nav item in `frontend/components/StudentShell.tsx` (today it's a disabled "Coming soon" entry). Shows correct-submission counts, average attempts, per-quiz detail, and misconceptions by tag/topic.
- **Teacher view** — new page under `(instructor)`, with cohort summary + per-student drill-down, and the XLSX upload entry point.

## Design decisions (fit to this system)

1. **New `lms_*` tables, not the existing `attempts` / `quiz_progress` models.** Those model the internal DAP tutor (MinIO code refs, AST misconception diffs); Moodle data has different identity (integer LMS IDs), different grain, and different semantics. Mixing them would corrupt both. We keep the LMS import as its own bounded context and only *join* to internal users via an identity match.
2. **Identity mapping, not identity assumption.** Local `users.username` ↔ LMS `Username` (fallback: `Email`). Store `matched_user_id` (nullable FK → `users.id`) on participants at import time. Teacher view works even for unmatched students; student view requires a match. Import response reports unmatched participants so the teacher can see coverage.
3. **Synchronous parse on upload.** The file is small (tens of thousands of cells). Parse with `openpyxl` (read-only mode) inside the request in one DB transaction; no Redis/queue machinery needed. Store the raw file in MinIO (bucket infra already exists via `app/core/storage.py`) for provenance.
4. **Upsert on natural LMS keys, import log for provenance.** Re-uploading a newer export updates rows in place (`ON CONFLICT` on the natural keys below); an `lms_imports` row records who/when/what counts. No versioning of historical imports for the MVP.
5. **Aggregation in SQL, not pandas.** All dashboard numbers come from async SQLAlchemy aggregate queries at request time — same pattern as the rest of the backend. No pandas dependency; only `openpyxl` is added.
6. **Misconception tags** (`VA-01`, `CD-03`, ...) will arrive as a QUESTION_BANK column in a future export. **Build the placeholder now**: the `misconception_tags JSONB` column on `lms_questions`, the parser reading the `Tag` column when present (silently null when absent), and the dashboard panels rendering an empty state until data arrives. A *wrong final answer* on a tagged question = evidence of that misconception. The tag's two-letter prefix maps to the 7 KC families already documented in `docs/fitur-misconception-pq-matrix.md` and `frontend/lib/kc-utils.ts`, so the student dashboard can group by topic with existing labels.
7. **No chart library for MVP.** The frontend has no charting dep; use Tailwind KPI cards, tables, and simple CSS/SVG bar meters (consistent with existing instructor pages). Revisit recharts only if needed.

## 1. Database plan (backend/app/models/ + one Alembic migration)

All tables prefixed `lms_`. LMS IDs are `BigInteger` (Moodle IDs), not UUIDs.

- **`lms_imports`** — id (UUID PK), uploaded_by (FK users.id), filename, storage_ref (MinIO key), status (`completed`/`failed`), row_counts (JSONB), unmatched_count (int), created_at.
- **`lms_courses`** — course_id (BigInt PK), shortname, fullname, fakultas, prodi, tahun_ajar.
- **`lms_participants`** — PK (course_id, lms_user_id, role_shortname); username, firstname, lastname, email, role_name; **matched_user_id** (nullable FK users.id, index).
- **`lms_quizzes`** — quiz_id (BigInt PK), course_id (FK), name, open_time, close_time (tz-aware), time_limit_seconds, max_grade, total_questions.
- **`lms_questions`** — PK (quiz_id, slot_number); question_id, name, type, text, **misconception_tags JSONB** (nullable list, e.g. `["VA-01"]`).
- **`lms_attempts`** — normalized attempt header (the sheet repeats it per slot): PK (quiz_id, lms_user_id, attempt_number); start_time, finish_time, total_grade.
- **`lms_attempt_answers`** — PK (quiz_id, lms_user_id, attempt_number, slot_number), FK → lms_attempts; question_summary, right_answer, student_answer, question_state (`gradedright`/`gradedwrong`/...), question_grade.
- **`lms_response_steps`** — id (UUID PK), FK → lms_attempts (composite) + slot_number, question_id, step, time, action, state, marks, coderunner_output (Text). Index on (quiz_id, lms_user_id).

Migration: single new Alembic revision following the existing `backend/alembic/versions/` style.

## 2. Backend plan

**Dependency:** add `openpyxl>=3.1.0` to `backend/requirements.txt` (rebuild backend image).

**New module `app/core/lms_import.py`** — pure parsing/upsert logic (keeps the router thin, mirrors how `app/core/misconception.py` backs `routers/attempts.py`):
- `parse_workbook(file) -> ParsedLms` — openpyxl read-only; header-name based column access (tolerant to column reordering); datetime parsing for the time columns; splits PARTICIPANT_ATTEMPTS into attempt headers + answers.
- `upsert_lms_data(db, parsed) -> ImportCounts` — PostgreSQL `insert().on_conflict_do_update()` per table, then username/email match pass to fill `matched_user_id`.

**New router `app/routers/lms_reports.py`** (`prefix="/lms"`), registered in `app/main.py`; schemas in `app/schemas/lms_reports.py`:

| Endpoint | Roles (`RoleChecker`) | Purpose |
|---|---|---|
| `POST /lms/imports` (multipart, `python-multipart` already installed) | instructor, researcher | Validate → store raw to MinIO → parse → upsert → return counts + unmatched participants |
| `GET /lms/imports` | instructor, researcher | Import history |
| `GET /lms/summary/teacher?course_id&quiz_id` | instructor, researcher | Cohort aggregates: participation, avg grade, avg attempts/student, per-question correct-rate, misconception-tag frequency |
| `GET /lms/summary/teacher/students/{lms_user_id}?course_id` | instructor, researcher | Per-student drill-down: quizzes, attempts timeline, per-question outcomes, misconceptions |
| `GET /lms/summary/teacher/students/{lms_user_id}/steps?quiz_id&attempt_number` | instructor, researcher | Response-step detail from `lms_response_steps` for the drill-down timeline (fetched lazily per attempt, since RESPONSE_HISTORY is the largest dataset) |
| `GET /lms/summary/student` | student, instructor, researcher | Same BOLA rule as `student_logs.py`: a student is force-resolved to their own `lms_participants` row via `matched_user_id == current_user.id`; 404 with clear message if unmatched |

Student summary payload: per-quiz `{quiz, attempts_used, best/last grade, correct_count/total, avg_attempts_per_question}` + overall KPIs + `misconceptions: [{tag, kc_family, wrong_count, quiz/slot refs}]`.

## 3. Page & layout plan (frontend)

**BFF proxy routes** (cookie-token pattern copied from `app/api/student-logs/route.ts`):
- `app/api/lms/imports/route.ts` (GET, POST — POST forwards `FormData`, not JSON)
- `app/api/lms/summary/teacher/route.ts`
- `app/api/lms/summary/teacher/students/[id]/route.ts`
- `app/api/lms/summary/student/route.ts`

**Student view — `app/(student)/student/history/page.tsx`:**
- Enable the "My History" item in `StudentShell.tsx` (remove the "Soon" disabled state, link to `/student/history`).
- Layout: KPI row (total correct submissions, overall correct-rate, avg attempts per question, quizzes attempted) → misconception panel grouped by KC family using `lib/kc-utils.ts` labels ("you struggled with Variable assignment on Quiz X slot 3") → quiz table with expandable per-question rows (state, grade, your answer vs right answer, attempt count).
- If the student has no `matched_user_id` link: friendly empty state ("your LMS account hasn't been linked yet — ask your instructor").

**Teacher view — `app/(instructor)/instructor/reports/page.tsx`** (+ `loading.tsx`, nav entry in the instructor layout):
- Upload card: file input → POST → show import result (rows per sheet, unmatched participants list).
- Cohort dashboard: course/quiz selectors → KPI row (students attempted / enrolled, avg grade, avg attempts) → per-question table (correct-rate bar, most-common wrong answer, misconception tag) → misconception frequency panel.
- Student list with search → drill-down (client-side panel or `/instructor/reports/[lmsUserId]`) reusing the same per-student payload as the student view, **plus a response-step timeline** from RESPONSE_HISTORY: per attempt, the sequence of steps (time, action, state, marks, CodeRunner output) so the teacher can see *how* a student worked through a question, not just the final answer. This detail level is teacher-only; the student view stays at answer granularity.

## Implementation order

1. Models + Alembic migration + `openpyxl` dep.
2. `core/lms_import.py` parser + upsert, exercised against `misc/Moodle_Quiz_Report_20260717_150343.xlsx` via a script/test in `backend/test/`.
3. `POST /lms/imports` + `GET /lms/imports`.
4. Summary endpoints (teacher, then student).
5. Frontend proxies + teacher reports page (upload first, so real data exists to build against).
6. Student history page + enable the nav item.

## Decided

- **Misconception `Tag` column**: not in the current export but will be added — build the full placeholder path now (column, optional parsing, empty-state panels). No rework needed when the column lands.
- **Timezone**: parse naive Moodle timestamps as Asia/Jakarta (WIB), store tz-aware.
- **RESPONSE_HISTORY**: imported and surfaced in the *teacher* per-student drill-down as a step timeline (lazy-loaded per attempt). Cohort dashboards and the student view aggregate only from `lms_attempt_answers`.

## Open items

- **`[Random Question / Soal Acak]` slots**: many QUESTION_BANK rows are placeholders for random slots; the actual question served appears in PARTICIPANT_ATTEMPTS `Question_Summary` / RESPONSE_HISTORY `Question_ID`. Per-question aggregates may need to key on the answered question rather than the slot placeholder — **pending a closer look at the real data** before deciding. Until then the parser stores both the slot row and the per-attempt question identifiers, so either keying strategy stays possible.
