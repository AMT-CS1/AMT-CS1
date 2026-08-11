# P4 Implementation Plan — Review Route, Overdue State, Tab-Detector Fix & Researcher Roster Seeding

**Refines:** the raw requirements in `misc/p4-implementation-plan-enhancement.md`
**Builds on:** the P3 homework/checkpoint workflow (`misc/p3-implementation-plan.md`) — Submit + `submitted_at`, `selection_mode`/`target_problems`, the `resolve_assigned_problems_async` resolver, the tab-switch detector, and the LMS/summary-report stack (`misc/summary-report-p2-implementation-plan.md`).
**Status:** 🟡 draft for review — no code written yet. Execute in the phased order of §8 after approval.

> **[Idea]** marks additions beyond the literal ask. **[Recommended]** marks a default I've chosen for an open decision — override in §7 before execution if you disagree.

---

## 0. Context — why this change

Four gaps surfaced after the P3 workflow shipped. Two of them (items 1 and 3) were prototyped in a prior session **and then reverted — the code is not on disk**, so they are genuinely open here; the other two are new.

1. **Review after submit shows nothing.** A student who submits a homework lands on the read-only dashboard, but its per-problem detail only renders *after the deadline*, so a submitted-but-pre-deadline set shows loading skeletons forever. There is no dedicated route to review one's own work (answers, status, attempt counts).
2. **No "overdue" signal on the package.** When a deadline passes the card shows a neutral amber "Ended" chip; there's no explicit, red *Overdue* state on the problem package / due-date panel.
3. **Tab detector double-counts.** One tab/app switch logs *two* integrity events (`window_blur` **and** `visibility_hidden`) and pops the warning twice.
4. **No researcher roster seeding.** There is no way for a researcher to upload an XLSX that provisions **student and teacher accounts + a classroom + the teacher↔class↔student wiring** in one step. Today accounts come from seed scripts, and linking a teacher to their class needs the manual `seed_lms_teacher.py` (the "teacher-LMS-matching gotcha").

Intended outcome: an honest self-review route available the moment a student submits, a clear overdue state on the package, exactly one integrity event per switch, and a one-upload researcher path that stands up a class with its teacher and students already linked.

---

## 1. What exists today (grounding)

Verified in the current working tree — each row drives a change below.

| Area | Current state | Evidence |
|---|---|---|
| Grade / review endpoint | `GET /targets/{id}/grade` returns score + `solved_keys`; it populates `problem_reviews` **only when `kind=="homework"` and `now >= deadline`**. Before the deadline (or for any checkpoint), `problem_reviews` is `None`. | `targets.py:255-355`, deadline gate `:296` |
| Read-only review dashboard | On submit *or* deadline the workspace routes into the read-only dashboard; its per-problem section is gated on `gradeInfo.problem_reviews`. When that's `None` it renders **skeleton placeholders indefinitely** → the "shows nothing" report. | `StudentWorkspace.tsx:1823` (route-in), `:1908` (gate), `:2025-2050` (skeleton null-branch) |
| Submit flow (P3, present) | `POST /homework/{id}/submit` is idempotent (`submitted_at` set once); `handleSubmitSet` calls it and refreshes status; `isSubmitted` flips off `hwStatuses[...].submitted_at`. **This is on disk** and item 1 builds on it. | `homework_workflow.py:588-660`; `StudentWorkspace.tsx:249,991-1010`; BFF `app/api/homework/[targetId]/submit/route.ts` |
| No dedicated review route | `GET /targets/{id}/review`, `app/api/targets/review/route.ts`, and `/student/review/[id]` **do not exist** (a prior attempt was reverted). | filesystem check |
| Overdue signal | Card top-right chip shows `Ended — Grade: N` (amber `Clock`) once `isEnded` (deadline passed); the "Assignment Timeline" panel shows a plain "Due Date" tile. No distinct red *Overdue* state, and nothing distinguishes "closed on time" from "past due, unfinished". | `StudentWorkspace.tsx:246` (`isEnded`), `:1235-1251` (chip), `:1323-1351` (timeline/Due tile) |
| Tab detector | Effect active only while solving MP/PS. Handlers: `onBlur = () => { if (!document.hidden) logSwitch('window_blur') }` and `onVisibility = () => { if (document.hidden) logSwitch('visibility_hidden') }`. A real switch fires `blur` **before** the document is marked hidden, so the guard misses and **both** fire → two logs + two warnings. No cooldown/debounce. | `StudentWorkspace.tsx:1024-1062`, handlers `:1052-1053` |
| Account creation | No self-registration. Accounts come from seed scripts using `get_password_hash`, or from the instructor homework `POST /upload-xlsx` which creates `users` with **password == username** and role, but **no class/teacher wiring**. | `security.py:30`; `homework_workflow.py:893,961-977` |
| Classroom model | A "class" is `LmsCourse` (`course_id` PK) + `LmsParticipant` (`role_shortname` ∈ {`student`, `editingteacher`, …}, `matched_user_id` → local account). | `models/lms.py:36-71` |
| Teacher scoping | Instructor dashboard is course-scoped: `resolve_teacher_course_ids` returns courses where the caller's account is the matched teacher participant. LMS import (`_match_participants`) only links **pre-existing** accounts by username/email — it never creates them, hence the manual `seed_lms_teacher.py` re-link. | `lms_reports.py:130-152`; `lms_import.py:317-338`; `scripts/seed_lms_teacher.py` |
| Existing XLSX importers | (a) `POST /lms/imports` (instructor/researcher) parses the 6-sheet Moodle quiz export and upserts `Lms*` tables, matching participants to existing accounts. (b) `POST /homework/upload-xlsx` (instructor) seeds users/targets/MP-bank/mappings. Both use `openpyxl`, MinIO raw-file provenance, and chunked upserts. | `lms_reports.py:40-117`; `lms_import.py`; `homework_workflow.py:893-1119` |
| Researcher UI | `frontend/app/(researcher)/researcher/page.tsx` is a thin "Weekly Targets Configuration" form + a Day-1 API-integration check. **No upload surface.** | researcher page |
| Alembic | Single head after the P3 merge (`d1e2f3a4b5c6`) + feature migration (`e2f3a4b5c6d7`). | `backend/alembic/versions/` |

---

## 2. Load-bearing decisions

- **D1 — Dedicated self-review route (item 1).** Add `GET /targets/{id}/review` + `/student/review/[id]`, available **as soon as the student submits** (not deadline-gated). It returns each assigned problem's title, solved/unsolved, **attempt count**, last-submission time, the student's own last code, and detected misconceptions. **Reference solutions stay deadline-gated** so early submitters can't harvest them. `GET /{id}/grade` is left as-is (score only) — the review route is the detail surface. This is exactly the shape prototyped-then-reverted, minus the reversion.
- **D2 — Overdue is a frontend-only state (item 2).** Derive `overdue = isEnded(target) && !completed && !submitted` from data already on the client (`deadline`, progress). No schema/API change. Render a red *Overdue* chip on the package and turn the due-date tile rose; a package finished on time keeps its neutral "Completed/Ended" look.
- **D3 — One integrity event per switch (item 3).** Collapse the `blur`+`visibilitychange` pair with a short **cooldown** (~1000 ms) shared by both handlers, so a single switch logs once and warns once. Keep both listeners (blur still catches same-desktop app switches that never hide the tab). No schema change.
- **D4 — Researcher roster importer provisions *and* links (item 4).** A new **researcher-gated** endpoint parses a roster workbook and, in one idempotent pass, upserts local `users` (teacher + students) with hashed passwords, upserts the `LmsCourse`, and writes `LmsParticipant` rows **with `matched_user_id` set directly** to the accounts it just created. Because matching is done at creation time, the teacher's scoped dashboard lights up immediately — no `seed_lms_teacher.py` follow-up. **[Recommended]** new endpoint rather than overloading the instructor homework importer (separation of concerns; different role, different purpose).
- **D5 — Reuse, don't re-model (item 4).** Reuse `LmsCourse`/`LmsParticipant`, `get_password_hash`, the MinIO provenance pattern, and `resolve_teacher_course_ids` downstream. **No new tables.** Student names live on `LmsParticipant.firstname/lastname` (the `users` table has no name column), so no migration is needed.

---

## 3. Requirement-by-requirement plan

### R1 — Self-review route after submit (raw item 1) — D1

**Problem.** `get_target_grade` only fills `problem_reviews` after the deadline (`targets.py:296`); a submitted set before its deadline renders the dashboard's skeleton branch forever (`StudentWorkspace.tsx:2025-2050`). The student also wants to see **how many attempts** they made — not currently returned anywhere.

**Backend — `GET /targets/{id}/review`** (roles: student self, instructor, researcher), `targets.py`:
- Resolve the assigned set via `resolve_assigned_problems_async(db, target, problems)` (same resolver the grade endpoint uses — keeps the denominator identical).
- For each assigned problem, return a `TargetReviewItem`:
  - `problem_key`, `problem_title`
  - `solved` — any passing attempt on the key
  - `attempts_count` — `COUNT(*)` of the caller's attempts on the key (all attempts, not just passing)
  - `last_submitted_at` — latest attempt timestamp
  - `student_code` — MinIO fetch of the latest attempt's `content_ref` (best-effort, like the grade path)
  - `misconceptions` — from the latest attempt
  - `reference_code` — **only when `now >= deadline`** (reuse `load_reference_files`); `None` otherwise
- Response `TargetReviewResponse`: `target_id, kind, week, title, deadline, total_problems, solved_problems, problem_reviews[]`.
- New schemas `TargetReviewItem` / `TargetReviewResponse` in `schemas/target.py` (leave `ProblemReviewItem` / `TargetGradeReviewResponse` untouched).

**BFF proxy.** `frontend/app/api/targets/review/route.ts` — `GET` with `?target_id=` forwarding to `targets/${id}/review` via `apiFetch`.

**Frontend — `/student/review/[id]/page.tsx`** (new client page): header (Week/title, `solved/total`, back button to `/student` or `/student/practicum` by `kind`), then a card per problem: title, solved/unsolved badge, **attempts chip**, last-submission time, the student's last code in a read-only `DapCodeEditor`, reference solution card (only when present), misconceptions block. Mirror the existing dashboard's visual language.

**Wiring.** On successful `handleSubmitSet`, `router.push('/student/review/${selectedTarget.id}')`. Add a **"Review Your Answers"** button (indigo, `BookOpen`) to both the homework read-only dashboard header (`:1893`) and the checkpoint "Ended" screen (`:1855`) so a submitted/ended package reaches the detail route in one click.

**[Idea]** Optionally give a completed/submitted **card** in the list a direct "Review" action → `/student/review/{id}`, skipping the intermediate dashboard.

No schema change (reads `attempts`, `content_ref`, `misconceptions`, `submitted_at` — all present).

### R2 — Overdue state on the problem package (raw item 2) — D2

**Problem.** Past-due packages only show a neutral "Ended" chip; nothing flags *overdue*, and an unfinished past-due package looks the same as one closed on time.

**Frontend only** (`StudentWorkspace.tsx`):
- Derive `overdue = isMounted && isEnded(target) && !isTargetCompleted(target) && !isSubmitted(target)`.
- **Card chip:** when `overdue`, render a red chip — `<Clock/> Overdue` (rose-50/rose-200/rose-700) — instead of the amber "Ended"; if ended *and* completed, keep the neutral completed/ended look. Show the grade inline as today.
- **Timeline "Due Date" tile** (`:1341-1347`): when past due, switch the tile to rose and append `Overdue · {formatCountdown(now − deadline)} ago` (or "Past due"); label homework "Overdue" and checkpoints "Closed" to match their wording.
- **Editor header** (`:2136,2165`): when in an overdue set, show a small rose "Overdue" pill next to `Due: …`.
- Wording keys off `mode` (`homework` vs `lab`/checkpoint). No API/schema change.

### R3 — Tab detector counts once (raw item 3) — D3

**Problem.** `blur` fires while `document.hidden` is still `false`, so the `!document.hidden` guard misses and both `window_blur` and `visibility_hidden` log for one switch (`StudentWorkspace.tsx:1052-1053`).

**Fix** (`StudentWorkspace.tsx`, tab-detector effect `:1024-1062`):
- Add a closure-local `let lastLoggedAt = 0;` inside the effect. In `logSwitch`, `const now = Date.now(); if (now - lastLoggedAt < 1000) return; lastLoggedAt = now;` before counting/logging/warning.
- Keep **both** listeners (blur catches app switches that don't hide the tab; visibility catches tab switches) — the cooldown dedupes the overlapping pair. Drop the now-redundant `!document.hidden` guard on blur so a same-desktop app switch still registers exactly once.
- Result: one `tab_switch` row, one counter increment, one warning per switch — which also keeps the teacher-facing count honest.

**Verify** there is no *second* detector (e.g., inside `MPQuizModal`) that would re-introduce a double count; the workspace effect already covers MP via `solvingMP`, so this is a single-site fix.

### R4 — Researcher roster XLSX seeding (raw item 4) — D4, D5

**Goal.** One researcher upload → student + teacher **accounts**, a **classroom**, and the **teacher↔class↔student** links, all reconciled so the teacher dashboard is immediately scoped and students can log in.

**Workbook shape** (tolerant sheet-name matching, like the existing importers):
- **COURSES** — `Course_ID`, `Shortname`, `Fullname` (+ optional `Fakultas`, `Prodi`, `Tahun_Ajar`) → upsert `LmsCourse`.
- **TEACHERS** — `Course_ID`, `Username`, `Full_Name`, `Password?`, `LMS_User_ID?` → upsert `User(role="instructor")` + `LmsParticipant(role_shortname="editingteacher", matched_user_id=<teacher>)`.
- **STUDENTS** — `Course_ID`, `Username`, `Full_Name`, `Password?`, `LMS_User_ID?` → upsert `User(role="student")` + `LmsParticipant(role_shortname="student", matched_user_id=<student>)`.

**Backend — new endpoint** `POST /lms/roster` (or `/admin/roster-import`), `RoleChecker(["researcher"])`, in a new `routers/roster.py` (or appended to `lms_reports.py`) with a parser module `core/roster_import.py` parallel to `lms_import.py`:
- Validate `.xlsx`, size cap, store the raw file in MinIO (best-effort), record provenance (reuse `LmsImport`, or add a lightweight `roster_imports` row — **[Recommended]** reuse `LmsImport` to avoid a migration).
- Provision accounts with `get_password_hash`. **Password policy [Recommended]:** honor an explicit `Password` column; otherwise fall back to a configurable default (documented as **demo-only / must be reset**). Never log plaintext.
- **Idempotency:** upsert `User` by `username` (update role; optionally reset password only when a `Password` cell is present), upsert `LmsCourse` by `course_id`, upsert `LmsParticipant` by `(course_id, lms_user_id, role_shortname)` with `matched_user_id` set to the account just created/found. Commit once.
- **`lms_user_id`:** **[Recommended]** require an `LMS_User_ID` column so a later Moodle quiz export (`POST /lms/imports`) reconciles on the same key; if absent, synthesize a stable surrogate from the username and flag it in the response (document the collision caveat vs. real Moodle IDs).
- Return counts: courses upserted, teachers created/updated, students created/updated, and any rows skipped (missing username/course).

**Frontend — researcher page** (`frontend/app/(researcher)/researcher/page.tsx`): add an **"Upload Roster (XLSX)"** card — file input, POST through a new BFF proxy `app/api/lms/roster/route.ts`, a result summary (counts + skipped rows), and a **downloadable template** (`public/templates/roster_template.xlsx`, generated once — see §5). **[Idea]** list "Provisioned classes" (course → teacher → student count) for confirmation.

**Reuse:** `get_password_hash` (`security.py:30`), `LmsCourse`/`LmsParticipant` (`models/lms.py`), the upsert/`_sheet_rows` pattern (`lms_import.py`), `upload_bytes_to_minio` (`core/storage.py`), and `resolve_teacher_course_ids` downstream (no change needed — it already keys off matched teacher participants).

---

## 4. Data model changes

**None required.** Every item reads/writes existing tables:

| Item | Storage | Migration |
|---|---|---|
| R1 review route | `attempts` (+ `content_ref`, `misconceptions`), `weekly_targets`, `target_problems` | — |
| R2 overdue | client-derived from `deadline` + progress | — |
| R3 tab detector | `interaction_logs` (unchanged) | — |
| R4 roster | `users`, `lms_courses`, `lms_participants`, `lms_imports` (provenance) | — |

Alembic stays at the single P3 head. If §7-Q3 lands on a dedicated `roster_imports` provenance table instead of reusing `LmsImport`, that's the *only* additive migration P4 would need.

---

## 5. Backend plan

- **Schemas:** `schemas/target.py` — add `TargetReviewItem` / `TargetReviewResponse` (R1). New `schemas/roster.py` — `RosterImportResult` (counts + skipped) (R4).
- **Routers:**
  - `targets.py` — new `GET /{id}/review` (R1); reuse `resolve_assigned_problems_async`, `download_text_from_minio`, `load_reference_files`; reference code gated on `now >= deadline`.
  - `routers/roster.py` **(new)** — `POST /lms/roster` (researcher) (R4).
- **Core:** `core/roster_import.py` **(new)** — `parse_roster_workbook` + `upsert_roster` (create/link users, courses, participants) mirroring `lms_import.py`'s structure and helpers.
- **No changes** to `attempts.py`, `homework_workflow.py`, or the MP engine.
- **Template generation:** a small one-off script (e.g. `scripts/generate_roster_template.py` using `openpyxl`) writes `frontend/public/templates/roster_template.xlsx` with the COURSES/TEACHERS/STUDENTS headers and one example row each. Run once; commit the artifact.

## 6. Frontend plan

- **`StudentWorkspace.tsx`** — submit → `router.push('/student/review/{id}')` and "Review Your Answers" buttons (R1); `overdue` chip + rose due-date tile + editor "Overdue" pill (R2); tab-detector cooldown (R3).
- **`app/(student)/student/review/[id]/page.tsx`** **(new)** — self-review detail page (R1).
- **`app/(researcher)/researcher/page.tsx`** — "Upload Roster (XLSX)" card + result summary + template link (R4).
- **BFF proxies (new):** `app/api/targets/review/route.ts` (R1), `app/api/lms/roster/route.ts` (R4).
- **Types:** add `TargetReview*` types alongside the existing target/grade types; a `RosterImportResult` type for the researcher card. Keep the Tailwind card/badge/table visual language.

---

## 7. Decisions — locked in for execution

| # | Question | ✅ Decision |
|---|---|---|
| Q1 | Is `attempts_count` **all** attempts or only distinct submissions? | **All** attempts on the key (`COUNT(*)`). Literal reading of "how many attempts"; a real struggle signal. Revisit to "distinct-code" only if it looks noisy. |
| Q2 | Roster **password** policy | Honor an explicit `Password` column; for blanks **generate a unique random temp password per account and return it** in the import result (never a shared constant). **Never reset an existing account's password on re-import** unless that row supplies one. No plaintext in logs. Shared demo default only behind an explicit throwaway flag. |
| Q3 | Roster **provenance** storage | Reuse `LmsImport`, tagging `row_counts` with `{"import_type": "roster", …}` so `GET /lms/imports` can distinguish it — no migration. Promote to a dedicated table only if it becomes first-class. |
| Q4 | `LMS_User_ID` when the roster omits it | **Require it** (the Moodle numeric id) and **fail loudly** on missing rows. Silent synthesis creates duplicate `LmsParticipant` rows once a real Moodle export lands, quietly breaking teacher scoping. Synthesis only behind an explicit "standalone class" flag. |
| Q5 | Overdue for a package **completed on time** | Neutral "Completed" (no red). Red *Overdue* only when `past deadline && !completed && !submitted` — a finalized Submit counts as done. |
---

## 8. Phased roadmap

| Phase | Deliverable | Depends on |
|---|---|---|
| **1. Review route (R1)** | `GET /targets/{id}/review` + schemas, BFF proxy, `/student/review/[id]` page, submit redirect + "Review Your Answers" buttons | P3 submit flow (present) |
| **2. Overdue state (R2)** | `overdue` chip + rose due-date tile + editor pill | — |
| **3. Tab-detector fix (R3)** | Cooldown dedupe in the detector effect | — |
| **4. Researcher roster (R4)** | `core/roster_import.py`, `POST /lms/roster`, researcher upload card + BFF + template | LMS models (present) |

Phases 1–3 are independent frontend/light-backend changes and can land in any order; Phase 4 is the larger, self-contained backend+UI piece.

---

## 9. Verification

- **Compile/type:** `python -m py_compile` on changed backend files; `npx tsc --noEmit` in `frontend/`. Backend restart to reload routers (`docker restart amt-backend`). No migration to apply.
- **R1:** submit a homework **before** its deadline → land on `/student/review/{id}` showing each problem's status, **attempt count**, last answer (read-only), misconceptions; reference solution **hidden** until the deadline, **shown** after. Re-opening creates no new attempts and moves no timestamp.
- **R2:** let a deadline pass on an unfinished package → red *Overdue* chip + rose due-date tile; a package completed before the deadline shows neutral Completed (no red).
- **R3:** switch tabs/apps once mid-solve → **exactly one** warning and **one** `tab_switch` row in `interaction_logs` (`GET /student-logs`); rapid repeated switches respect the ~1 s cooldown.
- **R4:** upload the roster template as a researcher → students + teacher accounts created (login works), `LmsCourse` + `LmsParticipant` rows written with `matched_user_id` set; logging in as the seeded teacher shows the class **already scoped** (no `seed_lms_teacher.py` needed). Re-uploading is idempotent (counts as updates, no dupes).

---

## 10. Out of scope / follow-ups

- Bulk password reset / first-login forced rotation for roster-provisioned accounts (propose demo-default now; harden later).
- A `full_name` column on `users` (names currently live on `LmsParticipant`); revisit only if the student UI needs to display real names.
- Merging the roster importer with the instructor homework `/upload-xlsx` into one configurable pipeline (kept separate here by role/purpose).
- Reconciling the `localStorage` submit mirror (`amt_solved_*` / `locallySubmitted`) with server-authoritative submit state — unchanged by P4.
- Teacher-facing tab-switch analytics dashboard (only the raw, now-correct count exists).
