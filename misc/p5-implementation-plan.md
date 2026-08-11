# P5 Implementation Plan — Option-Level Misconception Triggers, Per-Student Dashboard Isolation & Misconception Recommendations

**Refines:** the raw requirements in `misc/p5-enhancement-implementation-plan.md`
**Builds on:** the P3 homework/checkpoint workflow (`misc/p3-implementation-plan.md`) — MP session engine, `selection_mode`/`target_problems`, `submitted_at`; the P4 review/roster work (`misc/p4-implementation-plan.md`) — self-review route, roster importer + template-generation pattern; and the summary-report stack (`misc/summary-report-p2-implementation-plan.md`).
**Status:** 🟡 draft for review — no code written yet. Execute in the phased order of §8 after approval.

> **[Idea]** marks additions beyond the literal ask. **[Recommended]** marks a default I've chosen for an open decision — override in §7 before execution if you disagree.

---

## 0. Context — why this change

Three gaps surfaced after the P4 work landed. They are ordered here as they appear in the raw notes, but the *dependency* order is different (see §8): the reporting item (R3) needs the data R1 starts capturing.

1. **MP questions can't say which option means which misconception.** A `misconception_questions` row carries exactly one `misconception_tag` for the whole question. When a student picks a wrong option, the system records "got the *tag* wrong" — it cannot say *which* misconception that particular distractor reveals, and it cannot express that one question probes more than one misconception. This is the whole point of a misconception-diagnostic item, and it's the missing input for R3.
   **1a.** There is no dedicated XLSX template for authoring/seeding MP questions.
2. **`/student` looks the same for every account.** Log in as any student on the same browser and the homework dashboard shows the same solved/submitted state. The backend is correctly per-student; the frontend is not.
3. **The student's homework report never names their misconceptions.** The My History homework tab lists raw MP attempts and PS attempts, but there is no aggregate "here is what you keep getting wrong", and no recommendation of what to study next.

Intended outcome: MP items that diagnose per-option, a dashboard that is honestly scoped to the logged-in student, and a homework report that turns accumulated evidence into a named misconception profile plus concrete study guidance.

---

## 1. What exists today (grounding)

Verified in the current working tree — each row drives a change below.

| Area | Current state | Evidence |
|---|---|---|
| MP question shape | One `misconception_tag` per question (`String(8)`), `options_en`/`options_id` as parallel JSONB lists, `answer_index` (0-based). **No per-option semantics.** | `models/misconception_question.py:19,27-29` |
| Option D | Not stored — the bank ships **3** options; the UI synthesizes a fourth "Tidak Tahu" choice with a free-text box, and the backend hard-codes `selected_option == "D"` → always incorrect. | `routers/homework_workflow.py:463-467`; template `question bank` rows carry `["8","3","5"]`; `MPQuizModal.tsx:258` |
| MP attempt log | `student_mp_attempts` stores `selected_option` ('A'–'D'), `text_input`, `status`, and the **question's** `misconception_tag`. Nothing records what the chosen option actually revealed. | `models/homework_workflow.py:96-102` |
| MP queue build | Queue = `ProblemMisconception.misconception_tag` values for the assigned problems, in problem order (the P3 duplication rule), minus tags the student has ever answered correctly; empty → 3 random tags from the bank. | `routers/homework_workflow.py:314-344` |
| **Tag vocabulary is split** | `problem_misconceptions.misconception_tag` is `String(10)` and documented as specific codes (`"VA-01"`); `misconception_questions.misconception_tag` is `String(8)` and **seeded with KC-family tags** (`"LO"`,`"CD"`,`"VA"`,`"SQ"`). The MP bank lookup is **strict equality**, so a mapping row of `"VA-01"` matches **no** question → `current_question_id = None` and the student silently gets nothing / auto-advance. The PS side already tolerates both (prefix match). | `models/homework_workflow.py:17`; `scripts/seed_misconception_questions.py:33-209`; strict lookups `routers/homework_workflow.py:363,386,541`; tolerant PS match `routers/attempts.py:384` |
| Canonical tags | 8 KC-family tags with `name` + `description`: CO, VA, OP, EX, IO, CD, LO, SQ. Helpers `misconception_code_to_tag` (prefix → family) and `misconception_tag_name`. | `core/kcs.py:49-58,64-83` |
| MP seeding paths | (a) `scripts/seed_misconception_questions.py`; (b) instructor `POST /homework/upload-xlsx`, sheet **"question bank"**, 9 positional columns, upsert keyed on `(misconception_tag, text_en)`. Sheets are matched by tolerant name and **each is optional** (`next(..., None)`). | `routers/homework_workflow.py:1021-1080,951,980,1083` |
| Templates | `frontend/public/templates/sample_homework_template.xlsx` (4 sheets: participants / weekly_targets / question bank / problem_misconceptions) and `roster_template.xlsx`, generated by `scripts/generate_roster_template.py` and committed as artifacts. | filesystem; `scripts/generate_roster_template.py` |
| `/homework/status` | **Correctly per-student** — reads `StudentHomeworkProgress` filtered by `current_user["id"]`. | `routers/homework_workflow.py:198-247` |
| **Browser-global progress keys** | `StudentWorkspace` mirrors per-student progress into **un-namespaced** `localStorage`: `amt_submitted_targets` (read/write `:278`,`:1001`), `amt_solved_homeworks` (`:784`,`:973`), `amt_solved_problems_{targetId}` (`:796`,`:963`). These drive the completed/submitted card state and read-only routing, and they **override** what the server says. | `StudentWorkspace.tsx` lines as noted |
| **Checkpoint unlock leaks** | The lab password gate is remembered as `sessionStorage['amt_lab_pw_{targetId}']`, also un-namespaced — student B inherits student A's unlocked checkpoint in the same browser session. | `StudentWorkspace.tsx:288,309` |
| Logout | `POST /api/auth/logout` clears only the httpOnly `token` cookie **server-side**; `SignOutButton` never touches `localStorage`/`sessionStorage`, so every key above survives the account switch. | `app/api/auth/logout/route.ts`; `components/SignOutButton.tsx` |
| Identity available to the UI | JWT claims: `sub` = **user id (UUID)**, plus `username`, `role` inside `user_metadata`. `(student)/layout.tsx` already decodes the token server-side and passes `username` into `StudentShell`. | `routers/auth.py:30-36`; `core/security.py:51-62`; `(student)/layout.tsx` |
| Student homework report (API) | `GET /amt/summary/student/homework` → `student_homework_history`: per Week-n entry with an `mp` block (per-attempt tag / option / status) and a `ps` block (per-problem attempts with AST-detected `misconception_tags`). **No aggregation, no recommendations.** No `response_model` on the route, so the payload is a plain dict — additive fields are free. | `core/amt_reports.py:167-276`; `routers/amt_reports.py:98-110` |
| Report primitives that exist | `_attempt_tags` (attempt → KC-family tags, drops `GEN`), `_build_block`'s `misconceptions` roll-up (`{tag,name,count}`), and the `MisconceptionPanel` component — currently used **only** by the LMS history tab. | `core/amt_reports.py:39-52,113-116`; `components/reports/ui.tsx:85-121`; `history/page.tsx:82-84` |
| Student history UI | `NativeHistory` renders MP attempts and PS attempts raw, per week; no misconception summary anywhere in the homework tab. | `history/page.tsx:247-268,333-343` |
| PS-side misconception log | `student_misconception_records` already logs, per attempt, whether each of the problem's mapped tags was triggered (prefix-tolerant). Read by the teacher heatmap/drill-down; **not** read by the student report. | `routers/attempts.py:371-398`; consumers `routers/homework_workflow.py:137-145,759-765,861-864` |
| Alembic | Single head `e2f3a4b5c6d7` (P3 enhancements) on top of the `d1e2f3a4b5c6` merge. | `backend/alembic/versions/` |

---

## 2. Load-bearing decisions

- **D1 — Option-level triggers as one JSONB column parallel to the options (item 1).** Add `option_misconceptions: JSONB` to `misconception_questions`: a list the same length as `options_en`, where entry *i* is the **list of tags** that picking option *i* reveals. A list-of-lists (not a scalar) is what satisfies "each question might have more than one trigger" — both across options and within one option. The correct option's entry is `[]`. Nullable, so every existing row stays valid and the feature degrades to today's behavior.
- **D2 — Record what was actually triggered, per attempt (item 1 → item 3).** Add `triggered_tags: JSONB` to `student_mp_attempts`, written at submit time from the chosen option's entry. Without this, R3 can only report "you got a VA question wrong", and any later edit to a question would retroactively rewrite history. This column is the honest evidence trail and the join-free input for the profile in R3.
- **D3 — Fix the tag-vocabulary split rather than build on top of it (item 1).** Widen `misconception_questions.misconception_tag` to `String(10)` and make bank lookup **exact-match first, KC-family-prefix fallback second** (reusing `misconception_code_to_tag`), mirroring what `attempts.py:384` already does for PS. Specific codes (`VA-01`) stay legal in `problem_misconceptions` — the P3 duplication rule depends on them — but they now resolve to a question instead of silently yielding none. Without this, option-level triggers would be authored against a lookup that already fails.
- **D4 — One importer, one new template (item 1a).** Do **not** add an MP-specific endpoint. Extend the existing `question bank` sheet with optional trailing columns and ship a dedicated `mp_template.xlsx` containing only the `question bank` + `problem_misconceptions` sheets — the existing importer already treats every sheet as optional, so the same `POST /homework/upload-xlsx` accepts it unchanged. **[Recommended]** over a parallel endpoint: less surface, and MP authoring is genuinely the same operation the instructor already performs.
- **D5 — The dashboard bug is client-side state, and the fix is namespacing + a wipe (item 2).** The backend is already scoped. Namespace every progress key by the authenticated **user id** (JWT `sub`), clear foreign/stale keys on mount, and wipe them on sign-out. Purely presentational keys (`amt_split_ratio`, `amt_vsplit_ratio`) stay global — they're device preferences, not student data.
- **D6 — Server state is the source of truth; localStorage is a cache, not a record (item 2).** Where the server already knows the answer (`/homework/status` → `submitted_at`, `/targets/{id}/grade` → solved keys), the local mirror must never be able to *add* completion the server doesn't report. Namespacing alone fixes the reported symptom; demoting the mirror is what stops the class of bug recurring.
- **D7 — Recommendations are deterministic, not generated (item 3) — with a dormant LLM seam.** Rank the student's misconception tags by weighted evidence and map each to static study guidance extended onto `MISCONCEPTION_TAGS` in `core/kcs.py`. Reproducible, offline, no cost, and reviewable by the teaching staff. **The LLM rephrasing hook ships in P5 but stays switched off**: a new `RECOMMENDATIONS_LLM_ENABLED: bool = False` setting plus a pass-through `_phrase_recommendations()` seam, so the later work is flipping a flag and filling in a prompt, not retrofitting a call site. Nothing in `core/llm.py` is removed or changed.
- **D8 — The profile fuses both evidence sources (item 3).** MP wrong answers (via D2's `triggered_tags`) *and* PS AST-detected misconceptions (via `_attempt_tags`) roll up into one per-tag view, keeping the split visible so a student can see whether a concept fails in the quiz, in their code, or both.

---

## 3. Requirement-by-requirement plan

### R1 — Option-level misconception triggers + MP authoring template (raw item 1, 1a) — D1, D2, D3, D4

**Problem.** A question carries one tag for all options, so a wrong answer can't be attributed to a specific misconception, and a question can't probe several. Compounding it, mapping rows written as `VA-01` never match a bank seeded with `VA` (§1), so the tags being authored today can already fall on the floor.

**Schema** (one additive migration, see §4):
- `misconception_questions.option_misconceptions` — `JSONB NULL`. Parallel to `options_en`; entry *i* is a list of tags for option *i*. Example for a 3-option item whose answer is index 0: `[[], ["VA-01"], ["VA-02","EX-01"]]`.
- `misconception_questions.misconception_tag` — widen `String(8)` → `String(10)` to match `problem_misconceptions`.
- `student_mp_attempts.triggered_tags` — `JSONB NULL`, the tags credited to this attempt.

**Backend — `routers/homework_workflow.py`:**
- **Bank lookup helper.** Extract the repeated `select(MisconceptionQuestion).where(... == tag)` at `:363`, `:386`, `:541` into one `_questions_for_queue_tag(db, tag)`: exact match on the tag; if empty, fall back to `misconception_code_to_tag(tag)` (the KC family); if still empty, return `[]` and let the caller advance. Fixes the silent-nothing case.
- **`submit_mp_answer` (`:459-481`).** After resolving `selected_option`, derive `triggered = question.option_misconceptions[idx]` when the column is populated and the index is in range; else fall back to `[question.misconception_tag]` on a wrong answer, `[]` on a correct one. Store on the new `StudentMPAttempt.triggered_tags`. Correctness logic is unchanged — a distractor's trigger list is *diagnostic metadata*, never a scoring input.
- **Option D.** Keep it always-incorrect. **[Recommended]** treat "Tidak Tahu" as an *absence of evidence*, not a misconception: record `triggered_tags = []` and let the `text_input` carry the signal. Authors who disagree can put a trigger in a 4th slot — see §7-Q2.
- **`MPQuestionResponse`** (`schemas/homework_workflow.py:19-26`): **do not** expose `option_misconceptions` to the student — it labels the distractors and would give the answer away. Teacher-facing surfaces may read it directly.

**Importer — `routers/homework_workflow.py:1021-1080`:** append optional columns 10+ to the `question bank` sheet, one per option — `option_a_misconceptions`, `option_b_misconceptions`, `option_c_misconceptions` (`option_d_…` only if §7-Q2 says so). Each cell is a comma-separated tag list (`VA-01, EX-01`) or blank. Reuse the existing `parse_options` tolerance for a JSON-array form. Assemble into the parallel list, **validate every tag** against `MISCONCEPTION_TAG_IDS`/prefix rules, and report unknown tags in the response's `reconciled` summary rather than failing the whole upload. Length mismatch against `options_en` → pad with `[]` and flag.

**Template — `scripts/generate_mp_template.py`** (new, mirroring `generate_roster_template.py`): writes `frontend/public/templates/mp_template.xlsx` with
- **question bank** — the 9 existing headers plus the new per-option trigger columns, with two worked example rows;
- **problem_misconceptions** — `problem_key`, `misconception_tag`, so an author can wire new items to PS problems in the same file.

Run once in the container, commit the artifact. Add a **"MP Question Template"** download link + upload entry point next to the existing instructor XLSX upload (`XlsxUploadModal`), and **[Idea]** on the researcher page alongside the roster template card (`researcher/page.tsx:114-125`).

**Also refresh** `frontend/public/templates/sample_homework_template.xlsx` so its `question bank` sheet demonstrates the new columns.

### R2 — `/student` isolated per logged-in student (raw item 2) — D5, D6

**Problem.** `/homework/status` is correctly scoped to `current_user["id"]`, but `StudentWorkspace` reads and writes three **browser-global** `localStorage` keys and one `sessionStorage` key that carry per-student progress, and nothing clears them at sign-out. On a shared browser (the lab machines this app runs on) student B inherits student A's completed/submitted state — and A's **unlocked checkpoint**.

**Frontend — thread identity down:**
- `(student)/layout.tsx` already decodes the token; also read `decoded.sub` (the user id) and pass it through `StudentShell` → `StudentWorkspace` as `userId` (do the same for the practicum and review pages that mount the workspace).
- Add `lib/student-storage.ts`: `key(userId, name)` → `amt:{userId}:{name}`, plus `readJson`/`writeJson`/`clearAllForOtherUsers(userId)`. One module so no call site re-invents the prefix.

**Frontend — migrate the four keys** (`StudentWorkspace.tsx`):

| Old key | New key | Sites |
|---|---|---|
| `amt_submitted_targets` | `amt:{userId}:submitted_targets` | `:278`, `:1001` |
| `amt_solved_homeworks` | `amt:{userId}:solved_homeworks` | `:784`, `:973` |
| `amt_solved_problems_{targetId}` | `amt:{userId}:solved_problems_{targetId}` | `:796`, `:963` |
| `amt_lab_pw_{targetId}` (sessionStorage) | `amt:{userId}:lab_pw_{targetId}` | `:288`, `:309` |

`amt_split_ratio` / `amt_vsplit_ratio` (`:326`,`:331`,`:367`) stay global — device preferences, not student data.

**Frontend — clear on identity change and on sign-out:**
- On mount, `clearAllForOtherUsers(userId)` removes any `amt:*` entry belonging to a different user, **and** deletes the four legacy un-prefixed keys so existing browsers self-heal on first load after deploy.
- `SignOutButton.handleSignOut` wipes all `amt:*` keys from both storages *before* `POST /api/auth/logout`. **[Idea]** also `router.replace('/login')` instead of `push` so the authenticated page can't be reached with Back.

**Frontend — demote the mirror (D6):** after `/api/homework/status` resolves, let the server's `submitted_at` win over `locallySubmitted` for homework targets; keep the local mirror only for checkpoints, where the status endpoint doesn't apply (the reason it was introduced). Same for `solvedTargetIds` versus the grade endpoint's `solved_keys`. The mirror may render *ahead* of a refresh, never *instead* of the server.

**Verify** the same keys aren't read anywhere else — the grep in §1 shows all uses live in `StudentWorkspace.tsx`, so this is a single-file change plus the new helper and the sign-out button.

No backend or schema change.

### R3 — Misconception profile + study recommendations in the homework report (raw item 3) — D7, D8

**Problem.** `student_homework_history` returns raw MP and PS attempts; the student is left to infer their own pattern. Nothing names the recurring misconception, and nothing says what to study.

**Static guidance — `core/kcs.py`:** extend each `MISCONCEPTION_TAGS` entry with a `study_focus` (one actionable sentence: what to review and how to check yourself) and **[Idea]** `practice_hint`. Add `misconception_tag_guidance(tag) -> dict` next to the existing `misconception_tag_name`, falling back to the tag id so an unknown code never breaks the payload.

**Aggregation — `core/amt_reports.py`, new `_misconception_profile(mp_rows, ps_problems)`:**
- **MP evidence** — for each wrong `StudentMPAttempt`, credit `triggered_tags` (R1/D2) when present, else the attempt's `misconception_tag`. Normalize each to its KC family via `misconception_code_to_tag`, keeping the specific code for display.
- **PS evidence** — the tags already computed by `_attempt_tags` per PS attempt.
- Per tag emit `{tag, name, count, mp_count, ps_count, codes[], first_seen, last_seen}`, sorted by `count` desc. `name` via `misconception_tag_name` so the panel shape matches what `MisconceptionPanel` already consumes.
- **Recommendations** — take the top **3** tags (§7-Q4) with `count >= 1`, and emit `{tag, name, topic_area, count, study_focus, evidence: "quiz" | "code" | "both"}`. `topic_area` comes from `K_COMPONENTS`. Empty list when there's no evidence — the UI then shows a clean "nothing flagged yet" state rather than a hollow panel.

**LLM phrasing seam — built, disabled (D7).** The recommendation list passes through one final step before it is returned:

- `core/config.py` — add `RECOMMENDATIONS_LLM_ENABLED: bool = False` next to the existing `REMEDIATION_DUMMY_SQ` flag. Off in every environment; no `.env` change needed to keep it off.
- `core/amt_reports.py` — `async def _phrase_recommendations(items: list[dict]) -> list[dict]`. When the flag is false it **returns `items` unchanged** — that is the whole body today, so the deterministic `study_focus` text is what actually ships. When true, it would hand the items to `get_llm_provider()` for rewording.
- **Contract for the future implementation, stated now so the seam can't be misused:** the LLM may only rewrite the *wording* of `study_focus`. It must never change which tags are recommended, their order, their counts, or any other field — ranking stays deterministic and auditable. Any exception, timeout, or malformed response falls back to the deterministic text, the same way `detect_misconceptions` treats detection as a bonus that must never break the main path (`core/misconception.py:137-141`).
- Call it from `_recommendations()` so there is exactly one site to enable later.

This is deliberately more than a TODO comment: the seam, the flag, the fallback rule and the contract are all reviewed and merged now, while the prompt and provider call are left for a later phase.

**Wire into `student_homework_history` (`:214-276`):** add `misconception_profile` and `recommendations` to **each week's entry** (scoped to that week's MP + PS rows), and an **overall** pair at the top level across all `practice` entries. The route has no `response_model` (`routers/amt_reports.py:98`), so these are additive with no schema churn. **[Idea]** mirror the same block into `student_detail` so the teacher drill-down shows the identical profile the student sees.

**Frontend — `history/page.tsx`:**
- Extend the local interfaces (`:181-214`) with `MisconceptionProfileItem` / `RecommendationItem`, and add both fields to `HwEntry` and `HwHistory`.
- In `NativeHistory` for `context === 'practice'`, render above the week list:
  - **"Your misconception profile"** — reuse `MisconceptionPanel` (`components/reports/ui.tsx:85-121`) with the overall items; it already renders `{tag,name,count}` chips.
  - **"What to study next"** — a new card listing up to 3 recommendations: tag chip + concept name + topic area + `study_focus`, with an *evidence* badge (`Quiz` / `Code` / `Both`) and the occurrence count. Match the existing card language (`rounded-xl border border-slate-200 bg-white p-5 shadow-xs`).
- Inside each expanded week, show that week's compact profile next to the MP/PS split so the student can localize the pattern.
- **[Idea]** deep-link each recommendation into the existing remediation flow (`MisconceptionRemediation`) for that tag.

**Scope note.** `student_misconception_records` (the PS binary trigger log) is deliberately **not** the source here: the report already derives PS tags from `attempts.misconceptions` via `_attempt_tags`, and that path needs no extra join. Reconsider only if the two ever disagree — noted in §10.

---

## 4. Data model changes

One additive, reversible migration on top of head `e2f3a4b5c6d7`.

| Item | Change | Table |
|---|---|---|
| R1 / D1 | `option_misconceptions` `JSONB NULL` | `misconception_questions` |
| R1 / D3 | `misconception_tag` `String(8)` → `String(10)` | `misconception_questions` |
| R1 / D2 | `triggered_tags` `JSONB NULL` | `student_mp_attempts` |
| R2 | — (client-side only) | — |
| R3 | — (reads existing rows + R1's new columns) | — |

New revision `f4a5b6c7d8e9_p5_option_level_misconceptions`, `down_revision = 'e2f3a4b5c6d7'`. Both new columns are nullable with no server default, so existing rows and the whole pre-P5 code path keep working — **no backfill**, consistent with the standing no-backfill rule. Widening a `VARCHAR` is a metadata-only change in Postgres; `downgrade()` narrows it back and drops the two columns.

---

## 5. Backend plan

- **Models:** `misconception_question.py` — `option_misconceptions`, widened tag. `homework_workflow.py` — `StudentMPAttempt.triggered_tags`.
- **Core:**
  - `kcs.py` — `study_focus` on `MISCONCEPTION_TAGS` + `misconception_tag_guidance()`.
  - `amt_reports.py` — `_misconception_profile()`, `_recommendations()`, and the disabled `_phrase_recommendations()` seam; call sites in `student_homework_history` (per-entry + overall) and **[Idea]** `student_detail`.
  - `config.py` — `RECOMMENDATIONS_LLM_ENABLED: bool = False` (D7). `core/llm.py` itself is **not touched** — it stays exactly as it is for the later phase.
- **Routers:** `homework_workflow.py` — `_questions_for_queue_tag()` helper replacing the three strict lookups (`:363`,`:386`,`:541`); `triggered_tags` capture in `submit_mp_answer` (`:459-481`); new optional trigger columns in the `question bank` importer (`:1021-1080`) with tag validation surfaced in `reconciled`. No change to `amt_reports.py` router bodies (the payload is a dict) beyond docstrings.
- **Schemas:** `homework_workflow.py` — leave `MPQuestionResponse` **without** `option_misconceptions` (answer leak). **[Idea]** if the student report ever gets a `response_model`, add `MisconceptionProfileItem` / `RecommendationItem` to `schemas/amt_reports.py` at that point.
- **Scripts:** `generate_mp_template.py` (new); refresh `sample_homework_template.xlsx`; **[Idea]** extend `seed_misconception_questions.py` with `option_misconceptions` on a few items so a fresh demo DB exercises R3 end-to-end.
- **Untouched:** `attempts.py`, `problem_selection.py`, `roster_import.py`, the MP scoring rule, and all teacher-facing report endpoints.

## 6. Frontend plan

- **`lib/student-storage.ts`** *(new)* — namespaced storage helper + legacy-key cleanup (R2).
- **`(student)/layout.tsx`, `StudentShell.tsx`** — thread `userId` (JWT `sub`) alongside the existing `username` (R2).
- **`StudentWorkspace.tsx`** — migrate the four keys to the namespaced helper, clear foreign/legacy keys on mount, let server status win over the local mirror (R2).
- **`components/SignOutButton.tsx`** — wipe `amt:*` from `localStorage` + `sessionStorage` before the logout POST (R2).
- **`history/page.tsx`** — profile panel + "What to study next" card on the homework tab, per-week profile inside each entry, new types (R3).
- **`components/reports/ui.tsx`** — reuse `MisconceptionPanel` as-is; add a small `RecommendationCard` beside it (R3).
- **`components/homework/XlsxUploadModal.tsx`** and **`(researcher)/researcher/page.tsx`** — "MP Question Template" download link (R1a).
- **Types:** `homework-types.ts` for any MP additions; local interfaces in `history/page.tsx` for the profile/recommendation shapes. Keep the existing Tailwind card/badge language.
- **No new BFF proxies** — every endpoint involved already has one.

---

## 7. Decisions — for review before execution

| # | Question | Proposed |
|---|---|---|
| Q1 | Shape of `option_misconceptions` | **List-of-lists parallel to `options_en`** (`[[], ["VA-01"], ["VA-02","EX-01"]]`) rather than a `{"B": [...]}` map. Positional keeps it aligned with the two existing parallel option lists and survives reordering as one edit. |
| Q2 | Can option **D** ("Tidak Tahu") carry triggers? | **No — `triggered_tags = []`.** "I don't know" is absence of evidence; attributing a misconception to it would inflate the R3 profile with noise. It still scores incorrect and its `text_input` is still logged for audit. Flip to a 4th trigger slot only if the research design wants it. |
| Q3 | Tag vocabulary going forward | **Allow specific codes (`VA-01`) everywhere; resolve exact-first, KC-family-prefix-second.** Widen the bank column to `String(10)`. Keeps the P3 duplication rule intact while making today's silently-empty lookups work. Alternative — force everything to 2-letter families — is simpler but throws away diagnostic precision. |
| Q4 | How many recommendations to show | **Top 3** by weighted count. Enough to act on, few enough to not read as a verdict. Configurable constant, not a magic number in the loop. |
| Q5 | Storage namespace key | **JWT `sub` (user id UUID)** rather than username — stable if a username is ever corrected, and already available in the token the layout decodes. |
| Q6 | Weighting of MP vs PS evidence in the ranking | **Equal weight (raw count), with `mp_count`/`ps_count` returned separately** so the UI can show the split. Weighting is a pedagogical judgement I shouldn't bake in silently — say the word and it becomes a named constant. |

## 8. Phased roadmap

| Phase | Deliverable | Depends on |
|---|---|---|
| **1. Dashboard isolation (R2)** | Namespaced storage helper, `userId` threading, four migrated keys, sign-out wipe, legacy-key cleanup, server-wins mirror | — (pure frontend; ship first — it's the live correctness bug) |
| **2. Trigger schema + engine (R1 core)** | Migration `f4a5b6c7d8e9`, model fields, `_questions_for_queue_tag` fallback, `triggered_tags` capture at MP submit | Alembic head `e2f3a4b5c6d7` |
| **3. Authoring path (R1a)** | Importer columns + tag validation, `generate_mp_template.py`, `mp_template.xlsx`, refreshed sample template, UI download links | Phase 2 |
| **4. Profile + recommendations (R3)** | `study_focus` guidance, `_misconception_profile`, per-entry + overall payload, history-tab panels | Phase 2 (needs `triggered_tags` to be honest; degrades to the question-level tag before Phase 3 supplies real data) |

R2 is independent and should land first. R3 is *usable* right after Phase 2 and *good* once Phase 3 has seeded per-option triggers.

---

## 9. Verification

- **Compile/type:** `python -m py_compile` on changed backend files; `npx tsc --noEmit` in `frontend/`. Apply the migration (`alembic upgrade head`) and restart the backend (`docker restart amt-backend`); confirm `alembic heads` shows the single new head and that `downgrade` runs clean on a scratch DB.
- **R2 (the reported bug):** in one browser — log in as student A, complete/submit a homework, sign out, log in as student B. B's `/student` shows **B's own** state (fresh, or B's real progress), no inherited completed/submitted cards, and **no** inherited checkpoint unlock. DevTools → Application shows only `amt:{B-id}:*` plus the two global split-ratio keys; A's keys are gone after sign-out. Repeat without signing out (cookie swap) to confirm the on-mount foreign-key sweep also fires. Confirm a browser that had the old un-prefixed keys self-heals on first load.
- **R1 engine:** seed a question with `option_misconceptions`; answer it wrong on the option carrying two tags → `student_mp_attempts.triggered_tags` holds both, `status = "incorrect"`, and the score is unchanged from today. Answer correctly → `triggered_tags = []`. Answer **D** → `[]` with `text_input` persisted. Confirm `option_misconceptions` is **absent** from the `/mp-session` response payload.
- **R1 lookup fix:** map a problem to `VA-01` while the bank holds only `VA` → the MP session now serves a VA question instead of an empty/auto-advanced one. Regression-check a bank row tagged `VA-01` still exact-matches first.
- **R1a:** download `mp_template.xlsx`, fill two questions with per-option triggers, upload via the instructor XLSX path → rows created with the parallel list populated; an unknown tag is reported in the response summary and the rest of the upload still succeeds; re-uploading is idempotent (upsert on `(misconception_tag, text_en)`).
- **R3:** as a student with mixed MP wrongs and PS attempts, open My History → Homework: the profile panel names the tags with counts, the MP/PS split matches the raw attempts listed below it, and up to 3 recommendations render with concept name, topic area, evidence badge and `study_focus`. A student with no evidence sees the empty state, not an empty panel. Per-week profiles sum to the overall.
- **R3 LLM seam stays off:** `RECOMMENDATIONS_LLM_ENABLED` is `False` by default; confirm the recommendation text rendered in the UI is byte-identical to the `study_focus` strings in `core/kcs.py`, and that no provider call is made (no outbound request, nothing in the backend log from `get_llm_provider`). Temporarily flipping the flag on must still return the same tags in the same order — only wording may differ — and killing the provider mid-call must fall back to the deterministic text rather than erroring the report.
- **Cross-check:** teacher heatmap/drill-down and `upsert_class_summary` still return the same numbers (nothing in R1–R3 changes scoring or the PS trigger log).

---

## 10. Out of scope / follow-ups

- **LLM-phrased recommendations — deferred, not dropped.** The flag (`RECOMMENDATIONS_LLM_ENABLED`, default **false**), the `_phrase_recommendations()` seam and the "wording only, never ranking" contract all ship in P5 per D7; `core/llm.py` is left untouched. What remains for a later phase is only the prompt, the provider call, and a decision on caching/cost. D7's deterministic mapping stays the permanent floor and the fallback whenever the flag is off or the call fails.
- **Backfilling `triggered_tags`** for pre-P5 MP attempts — deliberately not done; the historical evidence genuinely isn't there, and inventing it from the question's current tag would misreport past work.
- **Reconciling `student_misconception_records` with `attempts.misconceptions`** as the single PS truth — two paths compute overlapping facts; worth unifying, but not while changing the MP side in the same release.
- **Teacher-facing option-level analytics** ("62% of the class picked the VA-02 distractor") — the data exists after R1; the distractor-analysis view is a natural P6.
- **Moving the whole client-side progress mirror to server state** — D6 demotes it; deleting it entirely means giving checkpoints a status endpoint of their own.
- **Forcing a client storage wipe on token expiry** (not just explicit sign-out) — the 1-hour cookie can lapse without `SignOutButton` ever running.
