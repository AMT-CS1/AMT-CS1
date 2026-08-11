# P3 Implementation Plan — Homework/Checkpoint Workflow Enhancements

**Refines:** the raw requirements in `misc/p3-implementation-plan-enhancement.md`
**Builds on:** the homework workflow shipped in `d3e7d75` (MP quiz modal, XLSX workbook parser, class analytics) and the Phase-2 reporting stack (`misc/summary-report-p2-implementation-plan.md`).
**Status:** ✅ reviewed & approved — ready to implement in the phased order of §8. No code written yet.

> **[Idea]** marks additions beyond the literal ask. **[Confirmed]** marks a decision the user locked in via the planning questions.

---

## 0. Context — why this change

The homework/checkpoint experience today works but is thin in six places the raw requirements call out:

1. A student finishing a set has **no explicit "Submit"** — completion is silently inferred, and the completion timestamp is **re-stamped every time the student re-opens a finished set to review** (a real bug).
2. Teachers can only steer a set by **KC-tag focus**; they can't hand-pick problems or ask for a random set.
3. The **student homework flow lacks the intended MP→PS visual state model** (red/green/yellow) and a PS "explain your pseudocode" step. (The MP quiz engine itself is already built — see R3-P2.)
4. There is **no tab/app-switch (cheat) detection**.
5. **Checkpoints cannot be closed** to students on demand.
6. **History is a flat per-problem list** with no per-homework grouping and no MP view at all.

The intended outcome: a coherent Week-n homework flow (MP gate → PS coding), teacher-controlled problem sets and checkpoint visibility, integrity logging, honest timestamps, and a per-homework history that separates MP and PS.

---

## 1. What exists today (grounding)

Verified during exploration — each drives a change below.

| Area | Current state | Evidence |
|---|---|---|
| Student workspace | One monolithic client component for both modes (`mode` prop: `homework`/`lab`). View derived: `list` / hint-quiz / ended-review / not-started / lab-password / editor. | `frontend/app/(student)/student/StudentWorkspace.tsx` (~2,414 lines) |
| Problem membership | **No target↔problem link.** Derived at query time by `kc_tags ∩ topic_kc_focus`, sliced to `MAX_ASSIGNED_PROBLEMS=3`. `randomize_problems` bool exists. | `targets.py:50-58` `matched_problem_keys`; `homework_workflow.py:68-75` `matched_problems_for_target`; client `getProblemsForTarget` `StudentWorkspace.tsx:346-384` |
| Submit / completion | No aggregate submit. Completion is implicit: last passing attempt flips `ps_status='completed'` + `ps_completed_at`. Also mirrored in `localStorage`. | `attempts.py:396-416` |
| Timestamp bug | `ps_completed_at = func.now()` re-runs on **every** passing submit with no "already completed" guard; a completed set stays fully editable before deadline, so "Review Code" re-enters the live editor and any re-run overwrites the completion time. | `attempts.py:414-416`; review path `StudentWorkspace.tsx:1247-1260`, `handleStartHomework:836-863` |
| MP quiz | **Already meets raw item 3 / Phase 2.** `get_or_create_mp_session` builds a per-problem-duplicated `tag_queue`, filters answered, random-fallback. Modal shows A/B/C + Option D (**"Lainnya / Jawaban Sendiri"** — backend comments it "Tidak Tahu") with required free-text; D always incorrect. Each answer logged to `student_mp_attempts`. | `homework_workflow.py:253-424,427-588`; `frontend/components/homework/MPQuizModal.tsx` |
| Phase colors | Backend returns `HomeworkPhaseStatus = red\|green\|yellow\|…` from `GET /homework/status`, but the **student UI ignores the colors** — used only to decide whether to open the MP modal. Colored chips render on the **instructor** side only. | `homework_workflow.py:204-250`; `StudentWorkspace.tsx:839`; `HomeworkAnalyticsView.tsx:196-214` |
| PS "explain pseudocode" | Does not exist. Only free-text surfaces are the concept-check confirmation and MP Option-D box. | PS editor `StudentWorkspace.tsx:2154-2206` |
| Tab detection | **None.** No `visibilitychange`/`blur`/`focus` handlers anywhere in the frontend (all `focus`/`blur` hits are Tailwind classes). | frontend grep |
| Checkpoint access | No visibility flag. `GET /targets` returns all targets to everyone (password nulled for non-instructors). | `targets.py:89-97` |
| History | Tabs **LMS / Homework / Checkpoint**; native tabs are **PS-only** (`attempts` split by `context`), flat per-problem, **no MP data**, no per-week grouping. | `history/page.tsx`; `components/reports/NativeBlock.tsx`; `core/amt_reports.py:59-143` |
| Event sink | Generic `interaction_logs` table + `POST /student-logs` (`{event_type, payload}`, `actor=user.id`, IDOR-safe read) already exists and is used for `click_solve_homework`. | `models/log.py`; `routers/student_logs.py` |
| **Alembic** | **Two unmerged heads:** `b7d8e9f0a1b2` (attempt context/target) and `3214af34e843` (homework-workflow tables). `alembic upgrade head` errors until merged. | `backend/alembic/versions/` |

---

## 2. Load-bearing decisions

- **D1 [Confirmed] — Teacher per-checkpoint publish toggle** for closing checkpoints. Add `weekly_targets.is_published`; students only see published targets; instructors/researchers see all. Existing `lab` rows are set **unpublished** in the migration so checkpoints are "closed now" until a teacher publishes.
- **D2 [Confirmed] — Cheat events reuse `interaction_logs`.** Log tab/app-switch via `POST /student-logs` with `event_type='tab_switch'` and a JSONB payload. **No new table, no migration** for this. (Overrides the raw ask's "update the schema".)
- **D3 [Confirmed] — Problem selection gains modes.** Add `selection_mode ∈ {kc, manual, random}`. `kc` keeps today's dynamic KC-overlap. `manual` and `random` both **materialize an explicit set** into a new `target_problems` join table (random = server picks N from the pool once at save time and freezes them → stable across students, simple reporting).
- **D4 — One shared resolver.** Replace the three divergent membership derivations (`matched_problem_keys`, `matched_problems_for_target`, client `getProblemsForTarget`) with a single backend helper `resolve_assigned_problems(target, problems)` that honors `selection_mode`; the client consumes the resolved keys returned on the target payload instead of re-deriving.
- **D5 — Submitted = read-only.** An explicit Submit finalizes the set (`submitted_at`), and a submitted set opens in the **existing read-only review dashboard** path (`isEnded` branch) instead of the live editor — which is what actually stops the timestamp from moving. Pair with an idempotency guard on `ps_completed_at`.

---

## 3. Requirement-by-requirement plan

### R1 — Submit button + honest timestamps (raw item 1)

- **Submit control** — in the workspace header near the `{n}/{total} Solved` counter (`StudentWorkspace.tsx:2073-2075`), render a **Submit** button, enabled only when every assigned problem is solved. Label mirrors mode: "Submit Homework" / "Submit Checkpoint".
- **Finalize endpoint** — `POST /homework/{weekly_target_id}/submit` (student, self): sets `progress.ps_status='completed'`, `submitted_at=now()`, and `ps_completed_at=now()` **only if still null**. Idempotent.
- **Idempotency guard (the bug fix)** — in `attempts.py:414-416`, only set `ps_completed_at` when transitioning into completed (i.e., when it is currently null / status wasn't already `completed`). Never overwrite an existing completion time.
- **Read-only after submit** — when `submitted_at` is set (or `ps_status='completed'`), the workspace routes into the existing read-only review dashboard (`StudentWorkspace.tsx:1681-1911`), not the editable editor. The "Review Code" button on a finished card points there. Result: reviewing creates **no** new attempts and moves **no** timestamps.
- **Backend safety** — `POST /attempts` rejects (or no-ops) new submissions for a target the student has already submitted, so the read-only guarantee holds server-side too.
- Schema: `+ student_homework_progress.submitted_at`.

### R2 — Teacher-managed problem sets + random (raw item 2) — D3

- **Schema:** new `target_problems(id, weekly_target_id FK CASCADE, problem_id FK CASCADE, position INT, UNIQUE(weekly_target_id, problem_id))`; `+ weekly_targets.selection_mode VARCHAR(10) DEFAULT 'kc'`; `+ weekly_targets.problem_count INT NULL` (replaces the hardcoded `MAX_ASSIGNED_PROBLEMS=3` default; `NULL` ⇒ fall back to 3).
- **Resolver** `resolve_assigned_problems(target, problems)` (new, in `homework_workflow.py`, imported by `targets.py` and `attempts.py`):
  - `kc` → today's KC-overlap, capped at `problem_count or 3`.
  - `manual`/`random` → the ordered `target_problems` rows (join), ignoring KC overlap.
- **Persist on create/update** (`targets.py` `configure_weekly_target` / update): write `selection_mode`, `problem_count`, and for manual/random write the `target_problems` rows (random = sample N from the KC/all pool server-side at save time).
- **Serialize** the resolved problem keys onto `TargetResponse` so the client stops re-deriving.
- **Teacher UI** (`HomeworkManager.tsx` drawer, near the KC pills `:612-661`): a **selection-mode** radio — *By KC focus* (existing) / *Pick problems* / *Random N*. `Pick problems` shows a searchable problem multi-select (from `GET /problems`) with drag/index order; `Random N` shows pool source (KC pool vs all) + a count field. Keep the live "matching count" hint for KC mode.
- **Consumers to update:** client `getProblemsForTarget` (use resolved keys), `GET /targets/{id}/grade` denominator (`targets.py:178-277`, use resolved set size not `MAX_ASSIGNED_PROBLEMS`), MP queue builder (uses the resolver so manual/random sets drive the MP tags).
- `randomize_problems` (legacy bool) is retained for back-compat but superseded by `selection_mode`.

### R3 — Refined homework business process (raw item 3)

**Phase 1 — Visual state (red/green/yellow).** Surface the state that already exists.
- Render each Week-n homework card as a **two-box package**: an **MP box** and a **PS box**, colored by `mp_status`/`ps_status` from `GET /homework/status`:
  - **Red** = not yet opened (module locked: previous week incomplete, or not started).
  - **Green** = open & actionable now (MP box while `mp_status≠completed`; PS box once MP completed).
  - **Yellow** = locked-until-green (PS box while MP incomplete).
- Enforce exactly **1 MP + 1 PS package per week** in the layout (already the backend's shape). This is mostly frontend surfacing of `mp_status`/`ps_status` plus a shared color legend component.

**Phase 2 — MP execution — ALREADY IMPLEMENTED (re-verified in code; no work required).** Every bullet the raw requirement lists already ships:
- **MP-before-PS gate** — MP completion flips `ps_status` `yellow → green`. `homework_workflow.py:507-531`.
- **Duplication rule** — per-problem tag append duplicates a shared misconception N times (matches the SQ-01 / VA-01×2 / VA-02 / Ex-01 example). `homework_workflow.py:321-324`.
- **Serve only unanswered, else random** — answered-correct tags are filtered out; an empty queue falls back to random bank tags. `:326-349`.
- **MP UI** — question description at top, options A/B/C, Option D with a required free-text box, D always scored incorrect, and every answer logged to `student_mp_attempts` (`selected_option`, `text_input`, `misconception_tag`, `status`, `timestamp`). `MPQuizModal.tsx:216-350`; `homework_workflow.py:466-484`.

**Optional cosmetic only (confirm before touching):** Option D currently reads "Lainnya / Jawaban Sendiri" (Other/Custom Answer) rather than the raw text's "Tidak Tahu (I Don't Know)" — the backend already comments it as "Tidak Tahu" (`:470`) and scores it wrong either way, so this is a one-line label choice, not functional work. Two further micro-refinements are possible but **not** required for spec compliance and left out unless you ask: scoping the answered-filter to the current week (today it's global across targets, `:327-329`) and reducing the random fallback from up to 3 to 1 (`:347`).

**Phase 3 — PS execution + "Jelasin Pseudocode".**
- Add a required **"Jelasin Pseudocode"** textarea at the bottom of the PS editor (sibling to `<DapCodeEditor>`, `StudentWorkspace.tsx:2154-2206`), before "Run & Verify".
- Persist per attempt: `+ attempts.pseudocode_explanation TEXT NULL`; carry through `AttemptCreate` schema and `POST /attempts`. Surface it in the teacher drill-down and student history (R6).

### R4 — Tab/app-switch cheat detector (raw item 4) — D2

- **Client** — a `useEffect` in `StudentWorkspace.tsx` (and the MP modal) active only while a student is solving MP or PS: listen for `document.visibilitychange` (→`hidden`) and `window` `blur`. On trigger, show a blocking warning modal ("Jangan pindah tab / aplikasi lain") and increment a counter.
- **Log** — `POST /student-logs` `{ event_type: 'tab_switch', payload: { target_id, phase: 'mp'|'ps', context, occurred_at, hidden_ms } }`. Reuses the existing `click_solve_homework` pattern (`StudentWorkspace.tsx:844-861`). **No migration.**
- **[Idea] Teacher visibility** — surface a per-student tab-switch count in the instructor drill-down by reading `interaction_logs` where `event_type='tab_switch'` (small read-side addition; optional, low priority).

### R5 — Close checkpoint view (raw item "Close the checkpoint view") — D1

- **Schema:** `+ weekly_targets.is_published BOOL DEFAULT TRUE`; migration sets existing `kind='lab'` rows to `FALSE` ("closed now").
- **Teacher UI:** a "Visible to students" toggle per checkpoint in `HomeworkManager.tsx`.
- **Student gating:** `GET /targets` (and `/homework/status`) filter out `is_published=false` for the `student` role; instructors/researchers still see all. `POST /attempts` and the lab-unlock endpoint reject unpublished targets for students. The practicum list/nav hides unpublished checkpoints.

### R6 — Per-homework history with separate MP & PS (raw item "history view")

- **Backend:** extend the native student report (`core/amt_reports.py`) — or add `GET /amt/summary/student/homework` — to **group by week/target** and, per homework, return two blocks:
  - **MP block** — from `student_mp_attempts` joined to `misconception_questions` + `weekly_targets`: per question → tag, chosen option, `text_input`, correct/incorrect, timestamp.
  - **PS block** — from `attempts` (split by `context`, mapped to week via `target_id`): per problem → attempt history, solved-at, misconceptions, `pseudocode_explanation`, lazy code view.
- **Frontend:** restructure `NativeHistory` (`history/page.tsx`) + `NativeBlock.tsx` from a flat problem list into **per-homework cards (Week-n)**, each expanding into two labeled sub-sections **MP** and **PS** with per-question detail. Applies to both the Homework and Checkpoint tabs.

---

## 4. Data model changes

Because of the **two Alembic heads**, migrations come in two steps.

**Migration A — merge heads** (no schema ops): `down_revision = ('b7d8e9f0a1b2', '3214af34e843')`. Unblocks `alembic upgrade head`.

**Migration B — features** (chains from the merge), all additive/reversible:

| Table | Change | For |
|---|---|---|
| `weekly_targets` | `+ selection_mode VARCHAR(10) DEFAULT 'kc'`, `+ problem_count INT NULL`, `+ is_published BOOL DEFAULT TRUE` (set existing `lab` rows → `FALSE`) | R2, R5 |
| `target_problems` *(new)* | `id, weekly_target_id FK CASCADE, problem_id FK CASCADE, position INT, UNIQUE(weekly_target_id, problem_id)` | R2 |
| `attempts` | `+ pseudocode_explanation TEXT NULL` | R3-P3 |
| `student_homework_progress` | `+ submitted_at TIMESTAMPTZ NULL` | R1 |
| *(none)* | cheat events reuse `interaction_logs` (D2) | R4 |

Follow the existing migration style in `backend/alembic/versions/`.

---

## 5. Backend plan

- **Models:** `models/target.py` (+`selection_mode`, `problem_count`, `is_published`; new `TargetProblem`), `models/attempt.py` (+`pseudocode_explanation`), `models/homework_workflow.py` `StudentHomeworkProgress` (+`submitted_at`). Register `TargetProblem` in `models/__init__.py`.
- **Schemas:** `schemas/target.py` `TargetCreate`/`TargetResponse` (+ mode/count/`is_published`/`problem_keys`), attempt schema (+`pseudocode_explanation`), a small `MPSubmit`-style submit request if needed.
- **Shared helper:** `resolve_assigned_problems(target, problems)` in `homework_workflow.py` (D4) — the single source of membership; delete/redirect the two twins (`matched_problem_keys`, `matched_problems_for_target`).
- **Routers:**
  - `targets.py` — persist mode/count/publish + `target_problems`; serialize resolved keys; filter unpublished for students; grade denominator from resolved set.
  - `homework_workflow.py` — new `POST /homework/{id}/submit`; optional drill-down tab-switch count. (MP session logic already complete — see R3-P2; touch only if the optional refinements there are requested.)
  - `attempts.py` — idempotent `ps_completed_at`; reject post-submit attempts; persist `pseudocode_explanation`; use the resolver.
  - `amt_reports.py` — per-homework grouped history incl. MP attempts (R6).
- **Reuse:** `interaction_logs` / `student_logs.py` (R4); `MisconceptionQuestion` bank + `student_mp_attempts` (R3-P2, R6); existing deadline/lab-unlock gates.

## 6. Frontend plan

- **`StudentWorkspace.tsx`** — Submit button + submitted⇒read-only routing (R1); two-box red/green/yellow package per week (R3-P1); "Jelasin Pseudocode" textarea wired into the attempt POST (R3-P3); tab-switch detector effect + warning modal (R4); `getProblemsForTarget` consumes resolved keys (R2); hide unpublished checkpoints (R5).
- **`MPQuizModal.tsx`** — no functional change; optional Option-D relabel → "Tidak Tahu (I Don't Know)" only if requested (R3-P2).
- **`HomeworkManager.tsx`** — selection-mode radio + problem multi-select + count (R2); checkpoint "Visible to students" toggle (R5).
- **`history/page.tsx` + `components/reports/NativeBlock.tsx`** — per-homework grouping with MP + PS sub-sections (R6).
- **Types / BFF:** update `lib/homework-types.ts`, `lib/amt-types.ts`, target types; add `app/api/homework/[id]/submit/route.ts`; reuse `app/api/student-logs`. Keep the Tailwind KPI/table/CSS-bar visual language (no chart dep).

---

## 7. Decisions — locked in

| # | Decision | Resolution |
|---|---|---|
| Q1 | Close checkpoint | **Teacher per-checkpoint publish toggle** (`is_published`); existing checkpoints start unpublished. |
| Q2 | Cheat-event storage | **Reuse `interaction_logs`** via `POST /student-logs`; no migration. |
| Q3 | Problem selection | **Add `manual` + `random` modes** alongside `kc`; explicit set stored in `target_problems`. |
| Q4 | Problem count | Configurable via `problem_count` (NULL ⇒ 3), decided in-plan. |

---

## 8. Phased roadmap

| Phase | Deliverable | Depends on |
|---|---|---|
| **0. Merge migration** | Alembic merge of the two heads (unblocks `upgrade head`) | — |
| **1. Feature migration + models/schemas** | `target_problems`, `selection_mode`, `problem_count`, `is_published`, `pseudocode_explanation`, `submitted_at` | 0 |
| **2. Problem selection (R2)** | `resolve_assigned_problems`, `targets.py` persist/serialize, HomeworkManager modes | 1 |
| **3. Submit + timestamp fix (R1)** | Idempotency guard, submit endpoint, Submit button, read-only review | 1 |
| **4. Homework process (R3)** | Color state (P1) + Jelasin Pseudocode (P3). **P2 (MP execution) already shipped** — optional Option-D relabel only | 2, 3 |
| **5. Checkpoint publish (R5)** | Toggle + student filtering | 1 |
| **6. Cheat detector (R4)** | Tab-switch listener + warning + `/student-logs` | — |
| **7. History (R6)** | Per-homework MP/PS grouped history | 1, 4 |

Phases 5 and 6 are independent and can run in parallel; 2 and 3 gate 4.

---

## 9. Verification

- **Compile/type:** `python -m py_compile` on changed backend files + both migrations; `npx tsc --noEmit` in `frontend/`.
- **Alembic:** `alembic heads` shows a **single** head after the merge; `alembic upgrade head` applies cleanly in the backend container.
- **R1:** finish all problems → **Submit** enabled → submit → card shows Completed; re-open "Review Code" → read-only, and `ps_completed_at`/`last_active_at` **do not change** (check DB before/after).
- **R2:** create a homework in each mode (KC / manual / random); verify the student sees exactly the intended set and the grade denominator matches.
- **R3:** week card shows MP(green)/PS(yellow) → complete MP → PS turns green (P1); the existing MP flow (Option D + logging) is unchanged (P2 already done); PS submit stores `pseudocode_explanation` (P3).
- **R4:** switch tabs mid-solve → warning modal; a `tab_switch` row lands in `interaction_logs` (`GET /student-logs`).
- **R5:** new checkpoint is hidden from students until the teacher toggles Visible; instructor/researcher always see it.
- **R6:** history Homework/Checkpoint tabs group by Week-n; each expands into separate MP and PS detail.

---

## 10. Out of scope / follow-ups

- Server-side persistence of the per-student random set (kept teacher-time & frozen per D3; revisit only if per-student randomization is wanted).
- Reconciling the `localStorage` progress mirror (`amt_solved_*`) with the new server-authoritative submit state — keep in sync, but a full localStorage removal is a separate cleanup.
- Richer proctoring (copy/paste guard, fullscreen enforcement) beyond tab/app-switch logging.
- Teacher-facing tab-switch analytics dashboard (only a raw count is proposed here).
