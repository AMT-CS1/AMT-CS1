# Summary Report — Phase 2 Implementation Plan

**Refines:** the raw use cases in `misc/summary-report-p2-plan.md`
**Builds on:** `misc/plan-summary-report.md` + `misc/amtcs1-report-implementation-plan.md` (Phase 1, already shipped on `feat/summary-reporting`)
**Status:** ✅ reviewed & confirmed (see §9) — ready to implement. No code written yet.

> **[Idea]** marks additions beyond what you literally asked for.

---

## 0. What Phase 1 already gives us

Shipped and in the tree today:

- **LMS bounded context** — `lms_*` tables, XLSX importer (`core/lms_import.py`), read-side aggregation (`core/lms_reports.py`), router (`routers/lms_reports.py`), schemas (`schemas/lms_reports.py`).
- **Teacher LMS Reports page** — `app/(instructor)/instructor/reports/page.tsx`: upload card, KPI row, quiz overview, per-question table, student roster → drill-down → lazy response-step timeline.
- **Student "My History" page** — `app/(student)/student/history/page.tsx`: LMS-only KPIs, misconceptions, per-quiz → per-slot (your answer vs reference answer).
- **Identity linking** — `lms_participants.matched_user_id` is filled for **every role** (student *and* teacher) by username/email match at import time.

Phase 2 is the six use cases in `summary-report-p2-plan.md`. They split into two themes:
**(A)** surface the **AMT-CS1 native interaction data** (the `attempts` / remediation tables) alongside the LMS data, for both students and teachers; and
**(B)** make every report **class-aware** and correctly **scoped per teacher**.

---

## 1. Gaps in the current code these use cases expose

Found while tracing the use cases through the existing code. Each drives a concrete change below.

| # | Gap | Evidence | Blocks |
|---|---|---|---|
| G1 | **Attempts carry no origin marker.** `source` is hardcoded `'manual'`; `target_id` is sent by the client but never persisted. No way to tell a Practice Workspace attempt from a Practicum one. | `attempt.py` has no `target_id`; `StudentWorkspace.tsx:864` posts `source: 'manual'`; `attempts.py` reads `target_id` only to gate `is_lab`. | UC1, UC2 |
| G2 | **No teacher→class scoping.** `teacher_summary()` takes `course_id` but never limits an instructor to their own courses. | `lms_reports.py` `get_teacher_summary` passes `course_id` straight through; no ownership check. | UC3, UC4 |
| G3 | **No native "class" model.** `users` has no class link; `weekly_targets.course_ref` is a free string not tied to an LMS course. | `user.py`, `target.py`. | UC2, UC3, UC4 |
| G4 | **Question body not exposed to students.** Student view shows answer-vs-reference only; `lms_questions.text` / `type` are loaded server-side but dropped from the student payload. | `StudentQuestionDetail` schema omits `question_text`. | UC6 |

---

## 2. Load-bearing decisions (all confirmed — §9)

**D1 — "Class" = LMS course, for *both* report families.** The LMS `COURSES` sheet (`course_id`, `shortname`, `fullname`) is the single source of truth for a class. Teacher membership and student membership both come from `lms_participants` (`role_shortname` + `matched_user_id`). *Rationale:* the data already exists and is already matched to local accounts; adding a parallel native `classes`/`enrollments` model would duplicate the roster and need its own admin UI. *Cost:* native AMT-CS1 reports become **class-aware only after an LMS export has been imported** and accounts matched. Un-imported classes still work ungrouped ("All my students").

**D2 — Record attempt origin on the attempt row (fixes G1).** Add two nullable columns to `attempts`: `context` (`'practice'` | `'practicum'`) and `target_id` (FK → `weekly_targets`, for drill-down + course association). Populate on create from the already-sent `target_id`/`mode`. Historical rows stay `NULL` → shown as "Uncategorized"; acceptable for a research prototype, no backfill required. *(Alternative considered: derive kind by joining `task_ref`→`weekly_targets` at read time — rejected, a problem can appear in both a homework and a lab, so the join is ambiguous. The attempt must record its own origin.)*

**D3 — Native class membership via LMS enrollment (fixes G3 without new tables).** A student's class = the course(s) where a `lms_participants` student row has `matched_user_id == user.id`. A teacher's classes = courses where a teacher-role row matches them. One shared helper resolves both; no `classes` table for the MVP.

**D4 — Symmetric module layout.** Mirror the LMS structure for native data: `core/amt_reports.py`, `routers/amt_reports.py` (prefix `/amt`), `schemas/amt_reports.py`, and BFF proxies under `app/api/amt/`. Keeps the two bounded contexts cleanly separated and the diff easy to review.

---

## 3. Use-case-by-use-case plan

### UC1 — Student "My History": separate LMS vs Practice/Practicum

Turn the single-purpose page into a **tabbed** view. Tab labels mirror the existing sidebar wording (Q5 — sidebar stays as-is): **`LMS` · `Practice Workspace` · `Practicum Session`**.

- **LMS tab** — the current content, unchanged (plus UC6 enrichment).
- **Practice Workspace tab** — from `attempts` where `context='practice'`: KPIs (problems attempted, pass rate, total attempts, avg attempts-to-pass), misconception panel (from `attempts.misconceptions` AST-diff codes → KC families via `core/kcs.py`), and a per-problem list → expandable attempt history (each attempt: timestamp, pass/fail, misconception chips, "view code" from `GET /attempts/{id}/code`).
- **Practicum Session tab** — same shape, `context='practicum'`; additionally shows the lab/target it belonged to and deadline outcome.

Backend: `GET /amt/summary/student` → `{ practice: {...}, practicum: {...} }`, force-resolved to the caller's own `user_id` (same BOLA rule as `student_logs.py`). No `course_id` needed (a student sees only themselves).

### UC2 — Teacher "AMT-CS1 Interactions" report (parallel to LMS Reports)

New instructor page `app/(instructor)/instructor/interactions/page.tsx` + nav entry ("AMT-CS1 Interactions"). Same visual language as LMS Reports.

- **Class selector** (UC3) + **Practice/Practicum** toggle at the top.
- **Cohort KPIs** — students active / enrolled, total attempts, avg attempts-to-pass, overall pass rate, remediation completion rate (`remediation_sessions`).
- **Per-problem table** — attempts, distinct students, pass rate (bar), avg attempts-to-pass, top misconception tag.
- **Misconception frequency panel** — over `attempts.misconceptions`, grouped by KC family (reuse `MisconceptionPanel` shape).
- **Student roster** → drill-down: per-student attempt timeline (problem, pass/fail, misconceptions, code viewer) + remediation progress. Reuses `GET /attempts?user_id=…` and `GET /attempts/{id}/code` for detail; a new aggregate endpoint powers the cohort/roster view.

Backend: `GET /amt/summary/teacher?course_id&context&problem_key`, `GET /amt/summary/teacher/students/{user_id}` in `core/amt_reports.py`, both **course-scoped to the teacher** (UC4).

### UC3 — Class grouping on both report families

- **Shared endpoint** `GET /reports/courses` → the teacher's courses `[{course_id, shortname, fullname, fakultas, prodi, tahun_ajar, student_count}]` (from `lms_participants`, scoped per D3). Feeds the class `<select>` on **both** the LMS Reports and AMT-CS1 Interactions pages.
- **LMS Reports page** — add a **Class** selector *above* the existing quiz selector; `course_id` flows into `GET /lms/summary/teacher`. Backend already accepts `course_id`; the UI just never exposed it.
- **AMT-CS1 page** — same selector; `course_id` flows into `GET /amt/summary/teacher`, filtering the roster to that course's matched students (D3).
- **Importer** — surface the `COURSES` sheet fields already parsed (`shortname`/`fullname`) in the course picker labels; add a small "Courses in this import" summary to the upload result card.

### UC4 — Multi-class teachers see only their classes (DB + authz)

- **Resolver** `resolve_teacher_course_ids(db, user_id) -> list[int]` — courses where an `lms_participants` row with `matched_user_id == user_id` counts as a **teacher of the class** by the confirmed rule (Q3): `role_name ILIKE '%teacher%'` **OR** `role_shortname == 'editingteacher'`. (Covers Moodle's "Teacher"/`editingteacher` and "Non-editing teacher"/`teacher`; drops the earlier `manager` guess.)
- **Enforcement** in every `instructor`-facing endpoint (`/lms/summary/*`, `/amt/summary/*`, `/reports/courses`): if `course_id` is passed, assert it's in the teacher's set (else `403`); if omitted, default the scope to `course_id IN (their courses)` rather than "all courses".
- **Researcher role — all-class access retained (Q4).** Only `instructor` is course-restricted; `researcher` bypasses the scope filter (research/oversight). Implement as: skip the resolver/assert when `role == 'researcher'`.
- **No schema change** for this UC — it's a query/authorization layer over existing `lms_participants`. G3's "native class" need is satisfied by D3 (join `attempts.user_id → users.id → lms_participants.matched_user_id → course_id`).

### UC5 — Teacher response timeline: filters + step detail + slot detail

Enhance the existing lazy `AttemptSteps` block and `GET /lms/summary/teacher/students/{id}/steps`.

- **Question filter** — a dropdown to view all slots or one slot; add optional `slot_number` query param to the steps endpoint.
- **Per-step detail** — make each step row expandable to show the full `action` (currently truncated to 24 chars) and full `coderunner_output`, plus `time` and `marks`.
- **Question-slot detail panel** — a new lightweight `GET /lms/quizzes/{quiz_id}/questions/{slot_number}` (or fold into the steps payload) returning the `lms_questions` row: `name`, `type`, `text`, `misconception_tags`, and the attempt's `right_answer`/`student_answer` for that slot. Rendered as a collapsible "Question details" header above the timeline.

### UC6 — Student sees full question details per quiz

- Extend `StudentQuestionDetail` (and `StudentQuizDetail` build in `student_report`) with `question_text` and `question_type` (already loaded via the `LmsQuestion` map — just carried into the payload; fixes G4).
- **Student history LMS tab** — the expanded slot shows the **question body** first (text + type badge), then the existing "your answer / reference answer" panels, and any misconception/"concept to review" chip for that question. Keep reference-answer visibility as-is (it's post-hoc LMS data, not a live homework solution).

---

## 4. Data model changes (one Alembic migration)

Minimal and additive — no destructive changes.

| Table | Change | For |
|---|---|---|
| `attempts` | `+ context VARCHAR(20) NULL` (`'practice'`/`'practicum'`), `+ target_id UUID NULL FK→weekly_targets(id) ON DELETE SET NULL`, index on `(user_id, context)` | G1 / UC1, UC2 |
| *(none)* | Class model, teacher→course, student→course all derive from existing `lms_participants` (D1, D3) | UC3, UC4 |

Single new revision in `backend/alembic/versions/` following the existing style. **[Idea]** If you'd rather not touch the shipped `attempts` schema, an alternative is a thin `attempt_context` side-table keyed by `attempt_id` — but two nullable columns are simpler and cheaper to query; recommending the columns.

---

## 5. Backend plan

**New modules** (mirror the LMS pattern):
- `app/core/amt_reports.py` — aggregation over `attempts` / `remediation_sessions`, split by `context`, scoped by resolved course roster.
- `app/routers/amt_reports.py` (`prefix="/amt"`), registered in `main.py`.
- `app/schemas/amt_reports.py`.
- Shared helper module (or add to `core/lms_reports.py`) for `resolve_teacher_course_ids` and `resolve_course_student_user_ids`.

**Endpoint summary:**

| Endpoint | Roles | Purpose | UC |
|---|---|---|---|
| `GET /reports/courses` | instructor, researcher | Teacher's classes for the selector (scoped) | 3,4 |
| `GET /amt/summary/teacher?course_id&context&problem_key` | instructor, researcher | Native cohort dashboard, course-scoped | 2,3,4 |
| `GET /amt/summary/teacher/students/{user_id}?course_id&context` | instructor, researcher | Native per-student drill-down | 2 |
| `GET /amt/summary/student` | student (+ teacher/researcher self) | Own native activity, split practice/practicum | 1 |
| `GET /lms/summary/teacher` | instructor, researcher | **+ enforce course scope** (UC4), unchanged shape | 3,4 |
| `GET /lms/summary/teacher/students/{id}/steps?quiz_id&attempt_number&slot_number` | instructor, researcher | **+ optional `slot_number` filter** | 5 |
| `GET /lms/quizzes/{quiz_id}/questions/{slot_number}` | instructor, researcher | Question-slot detail for the timeline | 5 |
| `GET /lms/summary/student` | student (+…) | **+ `question_text`/`question_type` in payload** | 6 |

**Attempt-create change** (`POST /attempts`): persist `context` (from `mode`/target kind) and `target_id`. One-line schema + insert change; the client already sends both.

---

## 6. Frontend plan

**Nav (sidebar labels unchanged per Q5):**
- Instructor layout — add an "AMT-CS1 Interactions" entry directly beneath the existing "LMS Reports" so the two reports read as a pair.
- Student shell — "My History" stays exactly as-is; the tabs live *inside* the page, not in the sidebar.

**Pages / components:**
- `app/(student)/student/history/page.tsx` — introduce a `Tabs` control (`LMS` / `Practice Workspace` / `Practicum Session`); factor the current LMS body into a `<LmsHistory>` child; add `<NativeHistory context="practice|practicum">`.
- `app/(instructor)/instructor/interactions/page.tsx` (+ `loading.tsx`) — new page; reuse `KpiCard`, `RateBar`, `StateBadge`, `MisconceptionPanel` (factor these shared bits out of `reports/page.tsx` into `components/reports/` so both pages import them instead of duplicating).
- `reports/page.tsx` — add the **Class** selector; wire `course_id`.
- Response-timeline (`AttemptSteps`) — question filter, expandable step rows, question-slot detail panel (UC5).
- **BFF proxies** under `app/api/amt/…` and `app/api/reports/courses/route.ts`, copying the cookie-token pattern from `app/api/lms/summary/teacher/route.ts`.
- **Types** — extend `lib/lms-types.ts` and add `lib/amt-types.ts`.

**No chart dependency** — continue with Tailwind KPI cards / tables / CSS bar meters, consistent with Phase 1.

---

## 7. Shared component refactor (do this first)

Phase 1 duplicated `KpiCard`, `pct`, `num`, `StateBadge`, `MisconceptionPanel` across the teacher and student pages. Before adding a third and fourth consumer, lift them into `frontend/components/reports/` and import everywhere. Small, mechanical, and it stops the duplication from tripling. **[Idea]** low-risk, high-payoff — recommend it as step 0.

---

## 8. Phased roadmap

| Phase | Deliverable | Depends on |
|---|---|---|
| **0. Refactor** | Extract shared report UI into `components/reports/` | — |
| **1. Attempt origin** | `attempts` migration (`context`, `target_id`); persist on `POST /attempts` | 0 |
| **2. Class scoping** | `resolve_teacher_course_ids`, enforce scope in LMS teacher endpoints, `GET /reports/courses`, Class selector on LMS Reports | — (parallel to 1) |
| **3. Native reports API** | `core/amt_reports.py` + `/amt/summary/*` (teacher + student), scoped | 1, 2 |
| **4. Student history tabs** | Tabbed My History; Practice/Practicum tabs (UC1); LMS question-body enrichment (UC6) | 1, 3 |
| **5. Teacher native page** | AMT-CS1 Interactions page + drill-down (UC2), class-grouped (UC3) | 2, 3 |
| **6. Timeline detail** | Response-timeline filters + step/slot detail (UC5) | 2 |

Phases 1 and 2 are independent; 4/5/6 can be split between frontend/backend once the Phase 3 API contract is fixed.

---

## 9. Decisions — locked in

| # | Decision | Resolution |
|---|---|---|
| Q1 | Class model | **LMS course is the class**, identified by `course_id` (with `shortname`/`fullname` as labels). Reuse the `COURSES`/`PARTICIPANTS` roster for both report families — no separate native class/enrollment tables. (D1, D3) |
| Q2 | Attempt origin | **Approved** — add `context` + `target_id` columns to `attempts`; historical rows are "Uncategorized", no backfill. (D2) |
| Q3 | Who is a teacher-of-class | `role_name ILIKE '%teacher%'` **OR** `role_shortname == 'editingteacher'` on a `matched` participant row. (drops `manager`) |
| Q4 | Researcher scope | **Researcher keeps all-class access; instructor restricted to their own classes.** |
| Q5 | Labels | **Sidebar labels unchanged.** In-page tabs mirror them: `LMS` / `Practice Workspace` / `Practicum Session`. |

## 10. Deferred (explicitly out of scope for Phase 2, per review)

- **`[Random Question / Soal Acak]` slot keying** — set aside for now. UC5's slot-detail may be approximate for random slots until real per-attempt question identifiers are inspected.
- **Misconception `Tag` column (LMS side)** — set aside for now. Native (`attempts.misconceptions`) misconception panels work today; LMS-side tag panels remain empty until the export includes the column.
