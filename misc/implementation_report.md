# Summary Report — Phase 2 Implementation Report

**Implements:** `misc/summary-report-p2-implementation-plan.md` (all six use cases + the seven-phase roadmap)
**Branch:** `feat/summary-reporting`
**Date:** 2026-07-22
**Status:** ✅ Code complete. One migration to apply before running (see §7).

---

## 1. Overview

Phase 2 surfaces the **AMT-CS1 native interaction data** (the in-tutor `attempts`
tables) alongside the existing **LMS** reports, for both students and teachers,
and makes every report **class-aware** and **scoped per teacher**. It was built
in seven phases; all are done and verified (backend `py_compile`, frontend
`tsc --noEmit`).

| UC | Requirement | Outcome |
|----|-------------|---------|
| UC1 | Student history split: LMS vs Practice/Practicum | My History is now tabbed **LMS · Practice Workspace · Practicum Session** |
| UC2 | Teacher AMT-CS1 interaction report | New **AMT-CS1 Interactions** page, parallel to LMS Reports |
| UC3 | Group reports by class | **Class selector** on both teacher pages, from the LMS `COURSES` roster |
| UC4 | Multi-class teachers see only their classes | Per-teacher course scoping enforced on every teacher endpoint |
| UC5 | Timeline: question filter + response detail + slot detail | Filter dropdown, expandable steps, question-slot panel |
| UC6 | Students see full question details | Question body + type now shown, not just answers |

---

## 2. Architecture decisions honored (from plan §9)

- **D1 / Q1** — "Class" = the LMS course (`course_id`, with `shortname`/`fullname`
  labels). Membership for teachers and students both derive from `lms_participants`;
  no separate native class tables were added.
- **D2 / Q2** — Attempt origin is recorded on the `attempts` row via two new nullable
  columns (`context`, `target_id`). Legacy rows stay NULL → "Uncategorized"; no backfill.
- **Q3** — A teacher-of-class is `role_name ILIKE '%teacher%'` **OR**
  `role_shortname == 'editingteacher'`.
- **Q4** — `researcher` keeps all-class access; `instructor` is restricted to their own.
- **Q5** — Sidebar labels unchanged; in-page tabs mirror them.
- **Deferred** — random-question slot keying and the LMS misconception-`Tag` column
  were left out of scope, as agreed.

---

## 3. Backend changes

### New files
| File | Purpose |
|------|---------|
| `backend/alembic/versions/b7d8e9f0a1b2_add_attempt_context_and_target.py` | Migration: adds `attempts.context`, `attempts.target_id`, index |
| `backend/app/core/amt_reports.py` | Read-side aggregation over `attempts` / `remediation_sessions`, split by context, class-scoped |
| `backend/app/routers/amt_reports.py` | `/amt/summary/*` endpoints + roster scoping |
| `backend/app/schemas/amt_reports.py` | Pydantic shapes for the native reports |

### Modified files
| File | Change |
|------|--------|
| `backend/app/models/attempt.py` | `+ context` (`practice`/`practicum`), `+ target_id` (FK→`weekly_targets`, `SET NULL`), `+ ix_attempts_user_context` |
| `backend/app/routers/attempts.py` | On `POST /attempts`, derive `context` from the target's `kind` and persist `target_id` |
| `backend/app/core/lms_reports.py` | `resolve_teacher_course_ids`, `resolve_course_student_user_ids`, `list_teacher_courses`; `teacher_summary` gains `allowed_course_ids`; `question_slot_detail`; `step_timeline` gains `slot_number`; UC6 `question_text`/`question_type` in the student payload |
| `backend/app/routers/lms_reports.py` | `_resolve_course_scope` (403 on out-of-scope); `GET /lms/courses`; `GET /lms/quizzes/{quiz_id}/questions/{slot_number}`; steps endpoint `slot_number` filter; teacher endpoints now scoped |
| `backend/app/schemas/lms_reports.py` | `CourseOut`; `QuestionSlotDetail`; `StudentQuestionDetail` + `question_text`/`question_type` |
| `backend/app/main.py` | Register `amt_reports.router` |

### Endpoints
| Method & path | Roles | Status | UC |
|---|---|---|---|
| `GET /lms/courses` | instructor, researcher | **new** | 3, 4 |
| `GET /lms/quizzes/{quiz_id}/questions/{slot_number}` | instructor, researcher | **new** | 5 |
| `GET /lms/summary/teacher` | instructor, researcher | now course-scoped | 3, 4 |
| `GET /lms/summary/teacher/students/{lms_user_id}` | instructor, researcher | now course-scoped | 4 |
| `GET /lms/summary/teacher/students/{id}/steps` | instructor, researcher | `+ slot_number` filter | 5 |
| `GET /lms/summary/student` | student (+…) | `+ question_text`/`type` | 6 |
| `GET /amt/summary/teacher` | instructor, researcher | **new** | 2, 3, 4 |
| `GET /amt/summary/teacher/students/{user_id}` | instructor, researcher | **new** | 2 |
| `GET /amt/summary/student` | student (+…) | **new** | 1 |

**Scoping rule:** `instructor` requests are limited to `resolve_teacher_course_ids`;
a specific out-of-scope `course_id` returns **403**; an omitted course defaults to
"all my classes". `researcher` bypasses the filter. BOLA is preserved — students
resolve to their own data; the teacher drill-down 403s on students outside the
teacher's classes.

---

## 4. Frontend changes

### New files
| File | Purpose |
|------|---------|
| `frontend/components/reports/formatters.ts` | `pct`, `num`, `dateTime` |
| `frontend/components/reports/ui.tsx` | `KpiCard`, `RateBar`, `StateBadge`, `MisconceptionPanel`, `Tabs` |
| `frontend/components/reports/NativeBlock.tsx` | One native context block (KPIs + concepts + per-problem attempts + lazy code viewer), reused by student tabs and teacher drill-down |
| `frontend/app/(instructor)/instructor/interactions/page.tsx` | Teacher AMT-CS1 Interactions dashboard + student drill-down |
| `frontend/app/(instructor)/instructor/interactions/loading.tsx` | Route skeleton |
| `frontend/lib/amt-types.ts` | TS shapes mirroring `amt_reports.py` |
| `frontend/app/api/lms/courses/route.ts` | BFF proxy → `lms/courses` |
| `frontend/app/api/lms/questions/route.ts` | BFF proxy → question-slot detail |
| `frontend/app/api/amt/summary/teacher/route.ts` | BFF proxy |
| `frontend/app/api/amt/summary/teacher/students/[id]/route.ts` | BFF proxy |
| `frontend/app/api/amt/summary/student/route.ts` | BFF proxy |

### Modified files
| File | Change |
|------|--------|
| `frontend/app/(student)/student/history/page.tsx` | Rewritten as tabs; `LmsHistory` sub-view (with UC6 question body) + `NativeHistory` (practice/practicum) |
| `frontend/app/(instructor)/instructor/reports/page.tsx` | Consume shared UI; **Class selector**; `AttemptSteps` gains question filter, expandable steps, and the question-slot detail panel (UC5) |
| `frontend/app/(instructor)/layout.tsx` | "AMT-CS1 Interactions" nav entry under "LMS Reports" |
| `frontend/lib/lms-types.ts` | `LmsCourse`; `StudentQuestionDetail` + `question_text`/`question_type`; `QuestionSlotDetail` |
| `frontend/app/api/lms/summary/steps/route.ts` | Pass `slot_number` through |

**Shared-component refactor (Phase 0):** the duplicated `KpiCard` / `RateBar` /
`StateBadge` / `MisconceptionPanel` / formatters were lifted into
`components/reports/` and are now imported by all four consumers (LMS teacher,
LMS student, AMT teacher, AMT student) instead of being copy-pasted.

---

## 5. Data model & migration

Migration **`b7d8e9f0a1b2`** (down-revision `a4c5d6e7f8a9`, the current head):

```
ALTER TABLE attempts ADD COLUMN context VARCHAR(20) NULL;      -- 'practice' | 'practicum'
ALTER TABLE attempts ADD COLUMN target_id UUID NULL
    REFERENCES weekly_targets(id) ON DELETE SET NULL;
CREATE INDEX ix_attempts_user_context ON attempts (user_id, context);
```

Additive and reversible; no data rewrite. `context` is denormalized from the
target's `kind` at submit time so reports don't re-join and the split survives a
later edit to the target.

No new class/enrollment tables — class membership is derived from the existing
`lms_participants` roster (D1/D3).

---

## 6. Verification

| Check | Result |
|-------|--------|
| `python -m py_compile` (all changed backend files + migration) | ✅ pass |
| `npx tsc --noEmit` (frontend) | ✅ pass |
| `npx eslint` (new/changed files) | Consistent with repo baseline (pre-existing `no-explicit-any` / `set-state-in-effect` style; not build-blocking here) |
| Alembic head | Single head confirmed (`a4c5d6e7f8a9` → new `b7d8e9f0a1b2`) |

**Not verified in this environment:** the backend was not executed (SQLAlchemy/
FastAPI run in the Docker stack, not the local shell), so the new aggregation
queries are verified by compile + review only — see the smoke test in §8.

---

## 7. Deployment steps

1. **Apply the migration** in the backend container:
   ```
   alembic upgrade head        # → b7d8e9f0a1b2
   ```
2. No new dependencies (backend or frontend). No env changes.
3. Restart backend + frontend as usual.

---

## 8. Suggested smoke test

- **Student** → *My History*: three tabs render. LMS tab shows the question body
  in an expanded slot (UC6). Practice/Practicum tabs populate after new
  submissions (legacy attempts are NULL-context by design).
- **Instructor** → *AMT-CS1 Interactions*: class selector lists only your classes;
  the Practice/Practicum toggle filters; a roster row drills into a student's
  practice + practicum blocks + remediation.
- **Instructor** → *LMS Reports*: Class selector appears above Quiz; the response
  timeline has a question filter, expandable steps, and a question-slot panel.
- **Scoping (UC4):** as an `instructor`, requesting another teacher's `course_id`
  returns 403; as a `researcher`, all classes are visible.

---

## 9. Deviations from the plan

- **Course list path** is `GET /lms/courses` (not `/reports/courses`) — reused the
  existing LMS router instead of standing up a third router prefix for one endpoint.
- **Student native tabs** intentionally exclude NULL-`context` (legacy) attempts —
  a direct consequence of the no-backfill decision (D2). Everything else follows
  the plan as written.

---

## 10. Follow-ups / notes

- The teacher **code viewer** (`GET /attempts/{id}/code`) lets any instructor read
  any student's submission by attempt id (pre-existing behavior; not class-scoped).
  Fine for trusted instructors, but worth revisiting if code access should also be
  class-scoped.
- Deferred from Phase 2 (unchanged): random-question slot keying, and the LMS-side
  misconception `Tag` column (native `attempts.misconceptions` panels already work).
- Once real Practice/Practicum data accumulates, revisit whether the cohort
  `solve_rate` (distinct student×problem solved / attempted) and
  `avg_attempts_per_student` are the most useful headline KPIs, or whether
  avg-attempts-to-first-solve should lead.
