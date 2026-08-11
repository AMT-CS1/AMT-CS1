# AMT-CS1 LMS Summary Report — Implementation Plan

**Refines:** `plan-summary-report.md`
**New in this revision:** the xlsx now carries both the Target Problem (coderunner) *and* the MP (multichoice) as slots in the same quiz, and `QUESTION_BANK` gets a new tagging column that names the misconception a question probes (e.g. `VA-01`, `VA-02`). That second point simplifies the whole misconception-resolution step, described in §2.

> **[Idea]** marks my own additions, not things you asked for.

---

## 0. What changes vs. the original plan

Your original plan (`plan-summary-report.md`) had misconception mapping as an unspecified step. Your new idea — one tag column in `QUESTION_BANK` — turns that into a concrete, buildable rule:

> **If a student's answer on a tagged MCQ is neither the `Right_Answer` nor the "Tidak tahu" option, log the tag on that question as a triggered misconception for that student.**

This means Indra does **not** need to hand-build a per-option mapping table before launch — the tag column alone is enough for a working MVP. I've kept a mapping table in the schema anyway (§3), but it's now populated automatically from the tag column rather than authored by hand, so if you later need per-option granularity (e.g. two different wrong options on one question pointing to two different misconceptions), you can override individual rows without changing the pipeline.

---

## 1. Source data — confirmed shape

Six sheets, as in your original plan. One addition:

| Sheet | Status |
|---|---|
| `COURSES`, `PARTICIPANTS`, `QUIZ_LIST`, `PARTICIPANT_ATTEMPTS`, `RESPONSE_HISTORY` | Unchanged from your plan |
| `QUESTION_BANK` | **+1 column**: `Misconception_Tag` (nullable text, e.g. `VA-01`) — populated only for MP/MCQ slots |

Within one quiz, slots now mix two roles by `Question_Type`:
- `coderunner` slot(s) → Target Problem (pseudocode solving)
- `multichoice` slot(s) with a `Misconception_Tag` → MP probes tied to that Target Problem

> **[Idea]** Consider a parallel `KC_Tag` column for the coderunner slot itself (e.g. `LO`, `OP`), separate from `Misconception_Tag` on the MCQ slots. Right now the Target Problem's own KC has to be inferred indirectly (via which MP follows it); a direct tag removes that guesswork and lets a Target Problem exist and be tagged even in a quiz that has no MP attached yet.

---

## 2. Database plan

Same four-layer structure from the earlier design, with the mapping simplified per §0. Full column lists are in the earlier design doc — this section only calls out what's load-bearing for implementation.

### Layer 0 — Upload & staging
`report_upload`, `staging_*` (one per sheet) — unchanged. Validate on upload: required sheets present, non-empty `Misconception_Tag` values match a known code in the `misconception` table, epoch-0 timestamps mapped to `NULL`, non-student roles flagged.

### Layer 1 — LMS mirror
`lms_course`, `lms_user`, `lms_quiz`, `lms_question` (**+ `misconception_tag` column**), `lms_attempt`, `lms_attempt_question`, `lms_response_step` — unchanged otherwise.

### Layer 2 — AMT-CS1 native activity
`amt_session`, `amt_event` — unchanged, still the only source for in-tutor engagement.

### Layer 3 — Semantic layer (simplified)
| Table | What changed |
|---|---|
| `kc`, `misconception` | Unchanged — fixed taxonomy |
| `target_problem` | Unchanged |
| `mp_question` | `hypothesis_misconception_id` now **auto-filled** from `lms_question.misconception_tag` at ingestion, instead of being hand-authored |
| `mp_option_misconception_map` | Now **derived**, not authored: on ingestion, generate one row per MCQ question — correct option → `is_correct=true`, "Tidak tahu" option → `is_dont_know=true`, every other option → `misconception_id` = the question's tag. Manual rows can still override a specific option later. |
| `target_attempt`, `mp_attempt`, `mp_response`, `misconception_event` | Unchanged |

### Layer 4 — Weekly aggregates
`report_week`, `student_week_engagement`, `student_week_learning`, `student_week_misconception`, `class_week_summary` — unchanged from the earlier design.

> **[Idea]** deferred to a later phase, not part of MVP: `attempt_trace_summary` and the coderunner-trace escalation path we discussed for the JariJari example. That logic depends on parsing `CodeRunner_Output`, which is a heavier lift than reading a tag column — sequence it after the MP-based path is working end to end.

---

## 3. Backend plan

### 3.1 Processing pipeline (unchanged shape, now simpler at step 4)

```
Upload xlsx → Validate → Stage → Reconcile (upsert lms_* mirror)
→ Enrich (resolve MP tag → misconception_event) → Aggregate (weekly metrics)
→ Freeze (report_week snapshot) → Publish (teacher-gated, manual)
```

### 3.2 Suggested stack

Given the rest of AMT-CS1 is Python-based (pandas/openpyxl already in your authoring workflow): **FastAPI** for the API layer, **pandas/openpyxl** for the xlsx parser (reused code, not new), **PostgreSQL** for storage, a simple job queue (or even a synchronous background task for PoC scale — ~35 students/course) for the ingest → aggregate → freeze sequence. This is a suggestion, not a constraint — swap freely if your programmer team has a different default.

### 3.3 API endpoints

| Method & path | Purpose | Caller |
|---|---|---|
| `POST /uploads` | Upload xlsx, returns `upload_id` + validation summary | Teacher |
| `GET /uploads/{id}` | Check validation/ingestion status | Teacher |
| `POST /report-weeks/generate` | Run aggregate + freeze for a course/week from the latest ingested upload | Teacher (or auto-scheduled) |
| `POST /report-weeks/{id}/publish` | Flip a frozen report from draft to published | Teacher |
| `GET /teacher/courses/{courseId}/weeks/{weekId}/summary` | Participation strip + attention panel data | Teacher |
| `GET /teacher/courses/{courseId}/weeks/{weekId}/students` | Class table rows (engagement + learning per student) | Teacher |
| `GET /teacher/courses/{courseId}/weeks/{weekId}/heatmap` | KC × misconception prevalence grid | Teacher |
| `GET /teacher/students/{studentId}/weeks/{weekId}` | One student's full detail, teacher-viewed | Teacher |
| `GET /student/me/weeks` | List of published weeks for the logged-in student (feeds the history page) | Student |
| `GET /student/me/weeks/{weekId}/summary` | Summary cards + KC progress | Student |
| `GET /student/me/weeks/{weekId}/attempts` | Attempt timeline with MP detail | Student |

### 3.4 Misconception resolution service (core new logic)

```
for each multichoice lms_attempt_question row with a linked mp_question:
    if student_answer == right_answer:
        continue  # correct, nothing to log
    if student_answer matches the "Tidak tahu" option:
        continue  # honest non-response, not a misconception signal
    tag = mp_question.hypothesis_misconception_id
    write misconception_event(
        student_id, kc_code = misconception.kc_code, misconception_id = tag,
        source_type = 'mp_response', source_ref_id = this row,
        detected_at = attempt_finish_time
    )
```

Recovery is checked separately: if the student's *next* attempt at the same `target_problem` is correct, mark the earlier `misconception_event.recovered = true`.

---

## 4. Frontend plan

### 4.1 Page structure

| Route | Audience | Notes |
|---|---|---|
| `/teacher/courses/:id/reports` | Teacher | Week selector + class report (the mockup from earlier) |
| `/teacher/students/:id/reports/:weekId` | Teacher | Drill-down, same component as student view below |
| `/student/reports` | Student | History page — list of published weeks, matches your "we can use the history page" note |
| `/student/reports/:weekId` | Student | Single week detail |

### 4.2 Component breakdown

**Shared components** (used by both views, since a lot of the visual language should stay consistent):
`MetricCard`, `KcProgressBar`, `AttemptTimeline` + `AttemptTimelineItem`, `WeekPicker`, `Badge`.

**Teacher-only:**
`ParticipationStrip`, `AttentionPanel` (composed of `InactiveStudentList` + `MisconceptionAlertList`), `StudentTable` (sortable, engagement/learning column groups), `MisconceptionHeatmap`, `ExportButton`.

**Student-only:**
`ActivityStrip` (7-day bars), `NextStepSuggestion`.

`AttemptTimeline` is the one component genuinely shared byte-for-byte between teacher drill-down and student self-view — build it once, pass a `viewerRole` prop that only changes copy tone (encouraging vs. neutral), never the underlying data shape.

### 4.3 Data fetching

Each page fetches its own summary/table/heatmap endpoint independently (not one giant payload) so the class table can render before the heatmap finishes, and so a teacher drilling into one student doesn't re-fetch the whole class. Weekly data is immutable once published, so it's safe to cache aggressively client-side — no need to re-poll a week that's already frozen.

---

## 5. Phased roadmap

| Phase | Deliverable | Depends on |
|---|---|---|
| **0. Foundations** | Upload endpoint, xlsx parser, staging tables, validation rules (epoch-0, non-student roles, `gaveup` handling) | — |
| **1. Ingestion** | Reconcile into `lms_*` mirror, idempotent upsert, re-upload safety | Phase 0 |
| **2. Misconception resolution** | Tag-based resolver (§3.4), `misconception_event` writes, recovery detection | Phase 1 |
| **3. Aggregation & freeze** | Weekly engagement + learning metrics, `report_week` snapshot + versioning | Phase 2 |
| **4. API layer** | All endpoints in §3.3 | Phase 3 |
| **5. Frontend — teacher** | Class report page, student drill-down, heatmap, export | Phase 4 |
| **6. Frontend — student** | History page, week detail, attempt timeline | Phase 4 (can run parallel to Phase 5) |
| **7. Publish workflow** | Draft/publish gating, consent-check hook (pending ethics form update) | Phase 5 & 6 |
| **8. (stretch) Trace analytics** | `attempt_trace_summary`, self-correction/thrash metrics, coderunner-trace misconception escalation | Phase 2, can start independently once bandwidth allows |

Phases 5 and 6 can run in parallel once Phase 4's API contract is fixed — that's the natural backend/frontend split point for your two programmers on this feature.

---

## 6. Assumptions to confirm

1. `Misconception_Tag` is one tag per MCQ question (not per option). If a single question sometimes needs two different wrong options to mean two different misconceptions, the `mp_option_misconception_map` table supports that override, but the xlsx column alone won't express it — flag any such questions for manual mapping.
2. "Tidak tahu" is identified by exact option text match — confirm the exact string(s) used so the resolver's exclusion rule is reliable (e.g. is it always literally "Tidak tahu", or does phrasing vary per question?).
3. The history page mentioned in your notes is the student-facing `/student/reports` route in §4.1 — confirm that's the page you meant, versus a separate existing page this should be added to.
