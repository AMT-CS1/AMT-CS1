# AMT-CS1 — User Acceptance Test (UAT) Cases

**Version:** 1.0
**Date:** 2026-07-30
**Scope:** Full application — Student, Instructor, Researcher and Rater journeys, including the P3/P4/P5 enhancements.
**Audience:** UAT testers, teaching staff acting as acceptance testers, and the research team.

> UAT verifies the system does what the *user* needs, in *their* language. Steps below are written so a non-developer can execute them. Anything requiring SQL or a terminal is marked **[Technical]** and may be delegated.

---

## 1. Test environment

| Item | Value |
|---|---|
| Frontend | `http://localhost:3000` |
| Backend API | `http://localhost:8000` (API docs at `/docs`) |
| Services | `amt-frontend`, `amt-backend`, `amt-postgres`, `amt-redis`, `amt-minio` |
| Health check | `http://localhost:3000/status` should show all services reachable |

**Start the stack**
```bash
docker compose up -d
docker exec amt-backend alembic upgrade head
```

**Reset to a clean demo state** (destroys demo progress — never run against real study data)
```bash
docker exec amt-backend python -m scripts.seed_demo
docker exec amt-backend python -m scripts.seed_misconception_questions
docker exec amt-backend python -m scripts.seed_reference_solutions
```

### 1.1 Test accounts

| Role | Username | Password |
|---|---|---|
| Student | `student_user` | `studentpass` |
| Student (2nd) | `demo_student_1` | `demostudentpass` |
| Student (3rd) | `demo_student_2` | `demostudentpass` |
| Instructor | `instructor_user` | `instructorpass` |
| Researcher | `researcher_user` | `researcherpass` |
| Rater | `rater_user` | `raterpass` |

> **Two student accounts are mandatory** for the data-isolation suite (§15). Use the *same browser* for those — that is the whole point of the test.

### 1.2 Test data files

| File | Used by |
|---|---|
| `frontend/public/templates/sample_homework_template.xlsx` | §11 course workbook import |
| `frontend/public/templates/mp_template.xlsx` | §11 MP question authoring |
| `frontend/public/templates/roster_template.xlsx` | §12 roster provisioning |
| `misc/Moodle_Quiz_Report_MOCK.xlsx` | §13 LMS import |

### 1.3 How to record results

Each case has **Result** (Pass / Fail / Blocked / N/A), **Tester**, **Date**, **Notes**. Log every Fail in §17.

**Priority:** **P1** = blocks release · **P2** = important, workaround may exist · **P3** = cosmetic/nice-to-have.

---

## 2. Authentication & Access Control (AUTH)

| ID | AUTH-01 | Priority | P1 |
|---|---|---|---|
| **Title** | Each role lands on its own dashboard after login | | |
| **Pre** | Logged out | | |
| **Steps** | 1. Go to `/login`. 2. Log in as `student_user`. 3. Note the landing page. 4. Sign out. 5. Repeat for `instructor_user`, `researcher_user`, `rater_user`. | | |
| **Expected** | Student → `/student` (Homework). Instructor → `/instructor`. Researcher → `/researcher`. Rater → `/rater`. Sidebar shows the correct role badge and the logged-in username. | | |

| ID | AUTH-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Wrong credentials are rejected with a clear message |
| **Steps** | Log in with `student_user` / `wrongpassword`. |
| **Expected** | Login is refused, an understandable error appears ("Incorrect username or password"), the user stays on `/login`, and no dashboard content flashes. The message must **not** reveal whether the username exists. |

| ID | AUTH-03 | Priority | P2 |
|---|---|---|---|
| **Title** | Empty fields are validated |
| **Steps** | Submit the login form with (a) both fields blank, (b) username only, (c) password only. |
| **Expected** | A validation message appears for each; no request is sent with empty credentials. |

| ID | AUTH-04 | Priority | P1 |
|---|---|---|---|
| **Title** | Sign-out ends the session |
| **Steps** | Log in as `student_user` → Sign Out → observe redirect. |
| **Expected** | Redirected to `/login`. The session cookie is cleared. |

| ID | AUTH-05 | Priority | P1 |
|---|---|---|---|
| **Title** | Browser Back after sign-out does not restore the dashboard |
| **Steps** | Log in as a student → Sign Out → press browser **Back**. |
| **Expected** | The authenticated page is **not** shown. User remains at / returns to `/login`. |

| ID | AUTH-06 | Priority | P1 |
|---|---|---|---|
| **Title** | Unauthenticated deep links are blocked |
| **Steps** | While logged out, paste each directly into the address bar: `/student`, `/instructor`, `/researcher`, `/rater`. |
| **Expected** | None render protected content; each redirects to login or shows an unauthorized state. |

| ID | AUTH-07 | Priority | P1 |
|---|---|---|---|
| **Title** | A student cannot reach staff areas |
| **Steps** | Logged in as `student_user`, navigate directly to `/instructor`, `/researcher`, `/rater`. |
| **Expected** | Access denied / redirected. No instructor data (class lists, other students' work) is visible at any point. |

| ID | AUTH-08 | Priority | P1 |
|---|---|---|---|
| **Title** | A student cannot read another student's data (BOLA) |
| **Pre** | **[Technical]** Obtain `demo_student_1`'s user id. |
| **Steps** | Logged in as `student_user`, call `GET /students/{demo_student_1_id}/progress`. |
| **Expected** | **403 Forbidden**. Students may only read their own progress. |

| ID | AUTH-09 | Priority | P2 |
|---|---|---|---|
| **Title** | Session expires after one hour |
| **Steps** | Log in, leave idle > 60 min, then act (e.g. open My History). |
| **Expected** | The user is returned to login rather than shown a broken/empty page. |

---

## 3. Student — Homework list & package states (SHW)

| ID | SHW-01 | Priority | P1 |
|---|---|---|---|
| **Title** | Homework list shows assigned weeks only |
| **Steps** | Log in as `student_user` → `/student`. |
| **Expected** | One card per published **homework** week, ordered by week number, each showing week, title, due date. Checkpoints do **not** appear here. |

| ID | SHW-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Colour-coded module states are correct |
| **Steps** | Open a homework card and inspect the MP and PS boxes. |
| **Expected** | **Green** = open/ready · **Yellow** = locked until the green module is done · **Red** = not open yet. Legend matches actual behaviour. |

| ID | SHW-03 | Priority | P2 |
|---|---|---|---|
| **Title** | A homework that has not started yet cannot be opened |
| **Pre** | Instructor sets a `starts_at` in the future (see IHM-07). |
| **Steps** | As the student, try to open that homework. |
| **Expected** | Shown as not open (red); opening is refused with a clear reason. |

| ID | SHW-04 | Priority | P1 |
|---|---|---|---|
| **Title** | Countdown and due date are shown and accurate |
| **Steps** | Open a homework with a future deadline; watch the timeline panel. |
| **Expected** | Due date renders in local time; countdown ticks down each second and matches the stated deadline. |

| ID | SHW-05 | Priority | P1 |
|---|---|---|---|
| **Title** | Overdue state is visibly distinct |
| **Pre** | A homework whose deadline has passed and that the student did **not** finish. |
| **Expected** | A red **Overdue** chip on the card and a rose due-date tile. A package **completed on time** shows the neutral Completed look — no red. |

---

## 4. Student — Misconception Problems / MP quiz (MPQ)

| ID | MPQ-01 | Priority | P1 |
|---|---|---|---|
| **Title** | MP must be completed before PS unlocks |
| **Steps** | Open a fresh homework. Attempt to open the PS (yellow) box before finishing MP. |
| **Expected** | PS stays locked. Only after the MP package completes does PS turn green and become clickable. |

| ID | MPQ-02 | Priority | P1 |
|---|---|---|---|
| **Title** | MP question renders correctly |
| **Steps** | Start the MP quiz. |
| **Expected** | Question text at the top, optional pseudocode snippet, then **four** choices: A, B, C and **D = "Tidak Tahu"** with a free-text box. Progress indicator (e.g. 2/5) is shown. |

| ID | MPQ-03 | Priority | P1 |
|---|---|---|---|
| **Title** | "Tidak Tahu" is accepted, scored incorrect, and captures the student's words |
| **Steps** | Choose **D**, type an explanation, submit. |
| **Expected** | Accepted; treated as **incorrect**; the typed text is stored; the quiz advances. |
| **[Technical] verify** | `select selected_option, text_input, status, triggered_tags from student_mp_attempts order by timestamp desc limit 1;` → `D`, the text, `incorrect`, and `triggered_tags = []` (an "I don't know" credits **no** misconception). |

| ID | MPQ-04 | Priority | P1 |
|---|---|---|---|
| **Title** | Answering advances through the queue and finishes the package |
| **Steps** | Answer every MP question. |
| **Expected** | Each submission advances; an explanation is shown after answering; at the end the MP box turns **Done** and PS unlocks. |

| ID | MPQ-05 | Priority | P2 |
|---|---|---|---|
| **Title** | Misconception duplication rule |
| **Pre** | A week whose PS problems share a misconception (e.g. PS1 → SQ-01, VA-01; PS2 → VA-01, VA-02). |
| **Expected** | The MP queue contains the shared misconception **once per referencing PS problem** (VA-01 appears twice in the example). |

| ID | MPQ-06 | Priority | P2 |
|---|---|---|---|
| **Title** | Previously mastered misconceptions are not re-asked |
| **Steps** | Complete an MP set correctly, then start a later week that reuses one of those tags. |
| **Expected** | Already-correct tags are skipped. If everything linked is exhausted, a random MP is served instead of an empty quiz. |

| ID | MPQ-07 | Priority | P1 | **(P5)** |
|---|---|---|---|---|
| **Title** | A wrong distractor records the misconception it reveals |
| **Pre** | Question with authored option triggers — e.g. the seeded LO item *"What is the final value of total…"* (option B → `LO, SQ`; option C → `LO`). |
| **Steps** | Answer that question with **option B**. |
| **Expected** | Scored incorrect exactly as before — the score is unchanged by this feature. |
| **[Technical] verify** | Latest `student_mp_attempts.triggered_tags` = `["LO","SQ"]`. Answering correctly stores `[]`. |

| ID | MPQ-08 | Priority | P1 | **(P5)** |
|---|---|---|---|---|
| **Title** | Distractor labels never leak to the student |
| **Steps** | With the MP quiz open, inspect the page source / network response for the question. |
| **Expected** | The response contains **no** `option_misconceptions` field. Nothing in the UI hints which option is the trap. |

| ID | MPQ-09 | Priority | P1 | **(P5)** |
|---|---|---|---|---|
| **Title** | Specific misconception codes still serve a question |
| **Pre** | **[Technical]** A problem mapped to a specific code (e.g. `VA-01`) while the bank holds the family tag `VA`. |
| **Steps** | Start that week's MP quiz. |
| **Expected** | A relevant question is served (family fallback). **Regression:** the quiz must never open blank or silently auto-complete. |

---

## 5. Student — Problem Solving / PS (PSV)

| ID | PSV-01 | Priority | P1 |
|---|---|---|---|
| **Title** | PS workspace loads and runs code |
| **Steps** | Open an unlocked PS problem. Read the statement, write pseudocode, press Run. |
| **Expected** | Split view (statement / editor / results) renders; Run returns test-case results; panes are resizable. |

| ID | PSV-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Correct solution is marked solved |
| **Steps** | Submit a correct solution. |
| **Expected** | Pass verdict; the problem is marked solved; the solved counter increases. |

| ID | PSV-03 | Priority | P1 |
|---|---|---|---|
| **Title** | Incorrect solution gives useful feedback without leaking the answer |
| **Steps** | Submit deliberately wrong code. |
| **Expected** | Fail verdict with failing test detail and/or misconception hints. **The reference solution is never shown.** |

| ID | PSV-04 | Priority | P1 |
|---|---|---|---|
| **Title** | "Jelasin Pseudocode" explanation is captured |
| **Steps** | Type an explanation in the *Jelasin Pseudocode* box, then submit. |
| **Expected** | Accepted and stored with the attempt; visible later in My History under that attempt. |
| **[Technical] verify** | `select pseudocode_explanation from attempts order by timestamp desc limit 1;` |

| ID | PSV-05 | Priority | P2 |
|---|---|---|---|
| **Title** | Language toggle works |
| **Steps** | Switch the problem description between EN and ID. |
| **Expected** | Statement and MP question text switch language; no untranslated placeholder or blank text. |

| ID | PSV-06 | Priority | P3 |
|---|---|---|---|
| **Title** | Speech-to-text input (where supported) |
| **Steps** | In a browser with speech support, use the microphone button on a text field. |
| **Expected** | Dictated text appears. On unsupported browsers the button is hidden/disabled — never broken. |

---

## 6. Student — Submit & Review (SUB)

| ID | SUB-01 | Priority | P1 |
|---|---|---|---|
| **Title** | Submit button appears only when the set is finished |
| **Steps** | Solve some but not all problems, then all of them. |
| **Expected** | The Submit control becomes available once every assigned problem is solved. |

| ID | SUB-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Submitting finalises the set and opens the review |
| **Steps** | Press Submit. |
| **Expected** | Confirmation, then landing on `/student/review/{id}` showing each problem's status, attempt count, last submission time and the student's own code. |

| ID | SUB-03 | Priority | P1 |
|---|---|---|---|
| **Title** | A submitted set is read-only and timestamps do not move |
| **Steps** | Re-open the submitted homework. Note the submission timestamp, navigate away, return. |
| **Expected** | Opens read-only; no new attempts are created by viewing; **the timestamp does not change** on each visit. |

| ID | SUB-04 | Priority | P1 |
|---|---|---|---|
| **Title** | Submitting twice is harmless |
| **Steps** | Attempt to submit the same set again (re-post / refresh). |
| **Expected** | No duplicate record, no error shown to the student; the original submission time is preserved. |

| ID | SUB-05 | Priority | P1 |
|---|---|---|---|
| **Title** | Reference solutions stay hidden until the deadline |
| **Steps** | Open the review of a set submitted **before** its deadline. Then re-check after the deadline passes. |
| **Expected** | Before deadline: student's own code and status only, **no reference solution**. After deadline: the reference solution appears. |

---

## 7. Student — Remediation & Hints (REM)

| ID | REM-01 | Priority | P2 |
|---|---|---|---|
| **Title** | Detected misconceptions trigger remediation |
| **Steps** | Submit code with a deliberate logic error (e.g. a loop that never increments). |
| **Expected** | The remediation overlay opens with remedial items for the detected tag(s). |

| ID | REM-02 | Priority | P2 |
|---|---|---|---|
| **Title** | Remediation runs tag by tag |
| **Steps** | Work through the remediation rounds. |
| **Expected** | A correct answer clears the current tag and advances; a wrong answer serves a different question for the same tag. Progress is preserved on reload. |

| ID | REM-03 | Priority | P2 |
|---|---|---|---|
| **Title** | Hint / concept-check quiz |
| **Steps** | Fail an attempt in homework mode and accept the hint offer. |
| **Expected** | The concept-check quiz opens with feedback; it does **not** stack on top of the remediation flow (only one remedial path at a time). |

| ID | REM-04 | Priority | P3 |
|---|---|---|---|
| **Title** | Understanding-confirmation question |
| **Steps** | Answer a probe correctly and continue to the confirmation step. |
| **Expected** | A confirmation question is generated; the typed explanation is judged and scored feedback shown. |

| ID | REM-05 | Priority | P3 |
|---|---|---|---|
| **Title** | Feedback rating |
| **Steps** | Rate a piece of generated feedback (thumbs up/down). |
| **Expected** | The rating is accepted and persists across reload. |

---

## 8. Student — Checkpoint / Practicum (CHK)

| ID | CHK-01 | Priority | P1 |
|---|---|---|---|
| **Title** | Unpublished checkpoints are invisible to students |
| **Pre** | Instructor leaves a checkpoint unpublished. |
| **Steps** | Student opens `/student/practicum`. |
| **Expected** | The unpublished checkpoint is **not** listed. (This is the P3 `is_published` gate, not a bug.) |

| ID | CHK-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Published checkpoint requires the correct password |
| **Steps** | Open a published, password-protected checkpoint. Enter the wrong password, then the right one. |
| **Expected** | Wrong → clear error, stays locked. Right → unlocks and the workspace opens. |

| ID | CHK-03 | Priority | P1 |
|---|---|---|---|
| **Title** | Checkpoint solving and submission |
| **Steps** | Solve and submit a checkpoint set. |
| **Expected** | Same behaviour as homework: solved tracking, Submit when complete, read-only afterwards. Remediation/hint offers are allowed here per design. |

| ID | CHK-04 | Priority | P1 | **(P5)** |
|---|---|---|---|---|
| **Title** | A checkpoint unlock does not transfer to the next student |
| **Steps** | Student A unlocks a checkpoint with the password. Sign out. Student B logs in **in the same browser** and opens the same checkpoint. |
| **Expected** | **Student B is prompted for the password.** B must never inherit A's unlocked session. |

---

## 9. Student — Integrity / Tab-switch detector (INT)

| ID | INT-01 | Priority | P1 |
|---|---|---|---|
| **Title** | One tab switch produces exactly one warning |
| **Steps** | While solving (MP modal open or PS editor active), switch to another browser tab once and come back. |
| **Expected** | **Exactly one** warning pop-up. The on-screen counter increases by **1**, not 2. |

| ID | INT-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Switching to another application is also detected |
| **Steps** | Switch to a different desktop application (not just another tab), then return. |
| **Expected** | Detected — one warning, one count. |

| ID | INT-03 | Priority | P2 |
|---|---|---|---|
| **Title** | Rapid repeated switching does not inflate the count |
| **Steps** | Switch away and back several times quickly (within ~1 second). |
| **Expected** | The ~1 s cooldown prevents double counting; the number shown is defensible to a student who disputes it. |

| ID | INT-04 | Priority | P1 |
|---|---|---|---|
| **Title** | Switch events are recorded for staff review |
| **[Technical] verify** | `select actor, event_type, payload, timestamp from interaction_logs where event_type='tab_switch' order by timestamp desc limit 10;` |
| **Expected** | One row per detected switch, attributed to the right student, with a sensible timestamp. |

| ID | INT-05 | Priority | P2 |
|---|---|---|---|
| **Title** | The detector is not active when it shouldn't be |
| **Steps** | Switch tabs while on the homework **list**, on My History, and on a **submitted** (read-only) set. |
| **Expected** | No warning and no logged event — the detector only runs while actively solving. |

---

## 10. Student — My History & personal report (SHR)

| ID | SHR-01 | Priority | P2 |
|---|---|---|---|
| **Title** | LMS tab when the account is not linked |
| **Steps** | As a student with no LMS match, open My History → LMS. |
| **Expected** | A friendly "your LMS account isn't linked yet" state — not an error and not an empty screen. |

| ID | SHR-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Homework tab groups activity per week |
| **Steps** | My History → Homework. Expand a week. |
| **Expected** | One entry per week showing `MP x/y correct · PS a/b solved`; expanding reveals separate **MP** and **PS** sections. |

| ID | SHR-03 | Priority | P1 |
|---|---|---|---|
| **Title** | MP answers are reviewable |
| **Expected** | Each MP row shows the tag, correct/incorrect, the question text, the chosen option (D shown as "D (Tidak Tahu)") and any typed reasoning. |

| ID | SHR-04 | Priority | P1 |
|---|---|---|---|
| **Title** | PS attempts are reviewable including submitted code |
| **Expected** | Per problem: solved badge, attempt count, per-attempt pass/fail, detected misconception tags, the *Jelasin Pseudocode* text, and a working **View code** toggle. |

| ID | SHR-05 | Priority | P1 | **(P5)** |
|---|---|---|---|---|
| **Title** | Misconception profile names what the student keeps getting wrong |
| **Pre** | A student with some wrong MP answers and/or failed PS attempts. |
| **Steps** | My History → Homework, look at the top of the tab. |
| **Expected** | A **"Your misconception profile"** panel listing concepts by name (e.g. *Variables (VA) ×3*), ordered most-frequent first. Counts are consistent with the raw attempts listed below. |

| ID | SHR-06 | Priority | P1 | **(P5)** |
|---|---|---|---|---|
| **Title** | Study recommendations are actionable |
| **Expected** | A **"What to study next"** card with up to **3** items, each showing concept name, topic area, an evidence badge (**Quiz** / **Code** / **Quiz + Code**), the occurrence count, and a concrete study sentence a student can act on. |

| ID | SHR-07 | Priority | P2 | **(P5)** |
|---|---|---|---|---|
| **Title** | Evidence badge reflects where the concept actually fails |
| **Steps** | Compare a concept flagged only in MP vs one flagged in both MP and PS. |
| **Expected** | MP-only → **Quiz**; PS-only → **Code**; both → **Quiz + Code**. |

| ID | SHR-08 | Priority | P2 | **(P5)** |
|---|---|---|---|---|
| **Title** | Per-week profile localises the pattern |
| **Steps** | Expand a week entry. |
| **Expected** | A "This week's misconceptions" strip whose chips are consistent with that week's MP/PS rows. Per-week counts sum to the overall panel. |

| ID | SHR-09 | Priority | P2 | **(P5)** |
|---|---|---|---|---|
| **Title** | Clean empty state for a student with no evidence |
| **Pre** | A fresh student with no wrong answers. |
| **Expected** | A clear "nothing flagged yet" message — **not** an empty box, a zero, or a broken panel. |

| ID | SHR-10 | Priority | P1 | **(P5)** |
|---|---|---|---|---|
| **Title** | Recommendation wording is the approved static text |
| **Expected** | Text matches the staff-reviewed guidance (no AI-generated phrasing — the LLM path is off by default). Wording is stable across refreshes. |

---

## 11. Instructor — Homework & Checkpoint management (IHM)

| ID | IHM-01 | Priority | P1 |
|---|---|---|---|
| **Title** | Create a homework by KC focus |
| **Steps** | `/instructor` → create homework → mode **By KC focus** → choose KC tags, week, title, deadline → save. |
| **Expected** | Created and listed; a student sees the matching problems. |

| ID | IHM-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Create a homework by manually picking problems |
| **Steps** | Mode **Pick problems** → select specific problems → save. |
| **Expected** | Exactly the chosen problems are assigned — verify as a student. |

| ID | IHM-03 | Priority | P1 |
|---|---|---|---|
| **Title** | Create a homework with random N problems |
| **Steps** | Mode **Random N** → set a count → save. |
| **Expected** | The student is assigned N problems; the card is flagged as randomised. |

| ID | IHM-04 | Priority | P1 |
|---|---|---|---|
| **Title** | Edit an existing homework |
| **Steps** | Change title, deadline and selection mode; save; reload. |
| **Expected** | Changes persist and are reflected on the student side. |

| ID | IHM-05 | Priority | P2 |
|---|---|---|---|
| **Title** | Delete a homework |
| **Steps** | Delete a test homework. |
| **Expected** | Confirmation is requested; after deletion it disappears for students. Existing attempt history is not corrupted. |

| ID | IHM-06 | Priority | P1 |
|---|---|---|---|
| **Title** | Publish / unpublish controls student visibility |
| **Steps** | Toggle **published** off on a checkpoint, check the student view, toggle back on. |
| **Expected** | Unpublished → hidden from students. Published → visible. Change takes effect on the student's next load. |

| ID | IHM-07 | Priority | P2 |
|---|---|---|---|
| **Title** | Start date and deadline are enforced |
| **Steps** | Set `starts_at` in the future and a near deadline; observe the student view before start and after deadline. |
| **Expected** | Not openable before the start; overdue treatment after the deadline. |

| ID | IHM-08 | Priority | P1 |
|---|---|---|---|
| **Title** | Create a password-protected checkpoint |
| **Steps** | `/instructor/practicum` → create a checkpoint with a password → publish. |
| **Expected** | Students are prompted for the password (see CHK-02). |

---

## 12. Instructor — Problem bank (IPB)

| ID | IPB-01 | Priority | P2 |
|---|---|---|---|
| **Title** | Browse and filter problems |
| **Steps** | `/instructor/problems`; filter by KC. |
| **Expected** | Problems list with key, title and KC tags; filtering works. |

| ID | IPB-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Create a problem |
| **Steps** | Add a problem with key, bilingual description, starter code, test cases, KC tags. |
| **Expected** | Saved and immediately assignable to a homework. |

| ID | IPB-03 | Priority | P2 |
|---|---|---|---|
| **Title** | Edit / delete a problem |
| **Expected** | Edits persist; deletion is confirmed first and does not break existing homework sets unexpectedly. |

| ID | IPB-04 | Priority | P1 |
|---|---|---|---|
| **Title** | Upload and remove reference solutions |
| **Steps** | Upload a reference solution file to a problem; verify it lists; delete it. |
| **Expected** | Upload/list/delete all work. The reference is used for misconception detection and appears to students **only after the deadline**. |

---

## 13. Instructor — Class analytics & submissions (IAN)

| ID | IAN-01 | Priority | P1 |
|---|---|---|---|
| **Title** | Class summary report |
| **Steps** | Open the analytics view for a homework week. |
| **Expected** | Per-student MP score, PS score, attempts and last-active; totals are plausible and match spot-checked students. |

| ID | IAN-02 | Priority | P2 |
|---|---|---|---|
| **Title** | Misconception heatmap |
| **Expected** | Per-misconception counts across the class; searching/sorting works; empty classes show an empty state, not an error. |

| ID | IAN-03 | Priority | P1 |
|---|---|---|---|
| **Title** | Student drill-down |
| **Steps** | Click a student in the class report. |
| **Expected** | That student's MP answers (tag, selected option, status) and PS attempts are shown. Numbers agree with what the student sees in My History. |

| ID | IAN-04 | Priority | P1 |
|---|---|---|---|
| **Title** | Submissions page |
| **Steps** | `/instructor/submissions`. |
| **Expected** | Submissions listed with student, problem and outcome; opening one shows the submitted code. |

| ID | IAN-05 | Priority | P2 |
|---|---|---|---|
| **Title** | Interactions page |
| **Steps** | `/instructor/interactions`; switch Homework / Checkpoint / Remediation tabs. |
| **Expected** | Interaction records render per tab without error. |

| ID | IAN-06 | Priority | P1 |
|---|---|---|---|
| **Title** | An instructor only sees their own classes (UC4 scoping) |
| **Pre** | Two courses with different teachers. |
| **Steps** | Log in as each instructor and compare the visible roster. |
| **Expected** | Each sees **only** their own class. Requesting another course returns 403. A researcher sees all classes. |
| **Known gotcha** | An empty instructor dashboard usually means the account is not matched as a class teacher, not a bug — check the LMS participant matching. |

---

## 14. Instructor — Course workbook & MP authoring import (XLS)

| ID | XLS-01 | Priority | P2 |
|---|---|---|---|
| **Title** | Templates are downloadable |
| **Steps** | Open the XLSX upload dialog; click **Download Sample Template** and **MP Question Template**. |
| **Expected** | Both `.xlsx` files download and open cleanly in Excel/LibreOffice. |

| ID | XLS-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Course workbook import creates users, targets, questions and mappings |
| **Steps** | Upload `sample_homework_template.xlsx`. |
| **Expected** | Success summary with counts for Participants / Targets / Question Bank / Mappings; the imported homework appears for students. |

| ID | XLS-03 | Priority | P1 |
|---|---|---|---|
| **Title** | Re-uploading the same workbook is safe |
| **Steps** | Upload the same file twice. |
| **Expected** | No duplicate users, targets or questions — rows are updated, not duplicated. |

| ID | XLS-04 | Priority | P1 |
|---|---|---|---|
| **Title** | Invalid files are rejected gracefully |
| **Steps** | Upload (a) a `.txt` renamed to `.xlsx`, (b) a valid but empty workbook. |
| **Expected** | A clear error; the system stays usable; no partial corruption. |

| ID | XLS-05 | Priority | P1 | **(P5)** |
|---|---|---|---|---|
| **Title** | MP template authors per-option misconception triggers |
| **Steps** | Fill `mp_template.xlsx` — a question with `option_b_misconceptions = VA-01` and `option_c_misconceptions = VA-02, SQ` — and upload it. |
| **Expected** | Import succeeds; the question is available in the MP quiz; answering option C later records both `VA-02` and `SQ` (see MPQ-07). |

| ID | XLS-06 | Priority | P2 | **(P5)** |
|---|---|---|---|---|
| **Title** | Unknown misconception tags are reported, not silently swallowed |
| **Steps** | Put a nonsense tag (e.g. `ZZ-99`) in a trigger column and upload. |
| **Expected** | Import still succeeds for the valid rows, **and** an amber warning panel lists the skipped tag with enough detail to find the row. |

| ID | XLS-07 | Priority | P2 | **(P5)** |
|---|---|---|---|---|
| **Title** | Old-format workbooks do not wipe authored triggers |
| **Steps** | Author triggers on a question, then re-upload a workbook **without** the trigger columns. |
| **Expected** | Previously authored triggers are **preserved**, not blanked. |

---

## 15. Researcher (RSC)

| ID | RSC-01 | Priority | P1 |
|---|---|---|---|
| **Title** | Roster template download |
| **Steps** | `/researcher` → **Template** on the Class Roster Provisioning card. |
| **Expected** | `roster_template.xlsx` downloads with COURSES / TEACHERS / STUDENTS sheets. |

| ID | RSC-02 | Priority | P1 |
|---|---|---|---|
| **Title** | One upload provisions a whole class |
| **Steps** | Fill the roster with one course, one teacher and 3 students; upload. |
| **Expected** | Summary shows courses / teachers created / students created. All new accounts can log in. |

| ID | RSC-03 | Priority | P1 |
|---|---|---|---|
| **Title** | Temporary passwords are shown once and are per-account |
| **Steps** | Leave the Password column blank for some rows. |
| **Expected** | A table of generated temporary passwords appears with a "shown once, distribute securely" warning. Each account has a **different** password. |

| ID | RSC-04 | Priority | P1 |
|---|---|---|---|
| **Title** | The provisioned teacher is scoped immediately |
| **Steps** | Log in as the newly created teacher and open the reports dashboard. |
| **Expected** | Their class and students appear straight away — **no manual re-linking step required**. |

| ID | RSC-05 | Priority | P1 |
|---|---|---|---|
| **Title** | Re-uploading the roster is idempotent |
| **Steps** | Upload the same roster again. |
| **Expected** | Counts show updates rather than creations; no duplicate accounts, courses or enrolments. Existing passwords are **not** reset unless a password is supplied. |

| ID | RSC-06 | Priority | P2 |
|---|---|---|---|
| **Title** | Bad rows are reported, not silently dropped |
| **Steps** | Include rows missing a username / course / LMS id. |
| **Expected** | A "skipped rows" list with a reason for each; valid rows still import. |

| ID | RSC-07 | Priority | P2 |
|---|---|---|---|
| **Title** | Weekly targets configuration |
| **Steps** | Use the Weekly Targets Configuration form. |
| **Expected** | Values save and take effect. |

| ID | RSC-08 | Priority | P3 | **(P5)** |
|---|---|---|---|---|
| **Title** | MP template is reachable from the researcher page |
| **Expected** | An **MP Template** download link is present with an explanation that it is uploaded through the instructor XLSX path. |

---

## 16. LMS reporting (LMS)

| ID | LMS-01 | Priority | P1 |
|---|---|---|---|
| **Title** | Import a Moodle quiz export |
| **Steps** | `/instructor/reports` → Import LMS Export → upload `misc/Moodle_Quiz_Report_MOCK.xlsx`. |
| **Expected** | Import succeeds with row counts; the import is listed in the import history. |

| ID | LMS-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Teacher LMS dashboard |
| **Expected** | Cohort KPIs, per-quiz and per-question statistics render for the teacher's own course(s). |

| ID | LMS-03 | Priority | P2 |
|---|---|---|---|
| **Title** | LMS student drill-down and per-question breakdown |
| **Expected** | Drilling into a student shows their quiz attempts; per-question view shows response detail. |

| ID | LMS-04 | Priority | P2 |
|---|---|---|---|
| **Title** | Student sees their own LMS history once matched |
| **Steps** | As a matched student, My History → LMS. |
| **Expected** | Their own quiz history and misconception panel render (contrast with SHR-01). |

| ID | LMS-05 | Priority | P2 |
|---|---|---|---|
| **Title** | Unmatched participants are visible as unmatched |
| **Expected** | Participants with no local account are clearly flagged rather than silently missing. |

---

## 17. Rater (RAT)

| ID | RAT-01 | Priority | P2 |
|---|---|---|---|
| **Title** | Expert review queue loads |
| **Steps** | Log in as `rater_user` → `/rater`. |
| **Expected** | Items awaiting expert review are listed with the context needed to judge them. |

| ID | RAT-02 | Priority | P2 |
|---|---|---|---|
| **Title** | Recording a verdict |
| **Steps** | Submit a verdict on a feedback item. |
| **Expected** | Saved, reflected in the list, and persists after reload. |

| ID | RAT-03 | Priority | P2 |
|---|---|---|---|
| **Title** | Rater cannot modify course content |
| **Steps** | Attempt to reach homework management or problem editing as the rater. |
| **Expected** | Not permitted. |

---

## 18. Multi-user data isolation — shared browser (ISO) **(P5 — highest risk)**

> These run on **one machine, one browser**, switching accounts. This is how the lab actually works, and it is where the most serious defect class lives.

| ID | ISO-01 | Priority | P1 |
|---|---|---|---|
| **Title** | Two students in the same browser see their own progress only |
| **Steps** | 1. Log in as `student_user`. 2. Solve at least one problem and submit a homework set. 3. Sign out. 4. Log in as `demo_student_1` in the **same browser**. 5. Open `/student`. |
| **Expected** | `demo_student_1` sees **their own** state — no inherited "completed"/"submitted" cards, no inherited solved ticks from `student_user`. |

| ID | ISO-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Sign-out leaves nothing behind |
| **Steps** | After ISO-01 step 3, open DevTools → Application → Local Storage / Session Storage for `localhost:3000`. |
| **Expected** | **No `amt:*` keys remain.** Only device preferences (`amt_split_ratio`, `amt_vsplit_ratio`) may persist. |

| ID | ISO-03 | Priority | P1 |
|---|---|---|---|
| **Title** | Progress is stored per account |
| **Steps** | While logged in as `demo_student_1`, inspect Local Storage. |
| **Expected** | Progress keys are namespaced to that account (`amt:<their-id>:…`). No key belonging to another account is present. |

| ID | ISO-04 | Priority | P1 |
|---|---|---|---|
| **Title** | Old cached data self-heals after upgrade |
| **Pre** | Manually add legacy keys via DevTools console: `localStorage.setItem('amt_solved_homeworks','["x"]'); localStorage.setItem('amt_submitted_targets','["x"]')` |
| **Steps** | Reload `/student` while logged in. |
| **Expected** | The legacy keys are removed automatically and do not affect what is displayed. |

| ID | ISO-05 | Priority | P1 |
|---|---|---|---|
| **Title** | Checkpoint unlock does not leak between accounts |
| **Steps** | See **CHK-04**. |
| **Expected** | Student B is prompted for the password. |

| ID | ISO-06 | Priority | P1 |
|---|---|---|---|
| **Title** | The server is the source of truth |
| **Steps** | With a student logged in, in DevTools set a *fake* completion: `localStorage.setItem('amt:<their-id>:submitted_targets', JSON.stringify(['<a-real-unsubmitted-target-id>']))`, then reload `/student`. |
| **Expected** | The fake "submitted" state is **discarded** after the homework status loads — a student cannot fake completion from the browser. |

| ID | ISO-07 | Priority | P2 |
|---|---|---|---|
| **Title** | Account switch without an explicit sign-out |
| **Steps** | Log in as A, then (without signing out) clear only the session cookie and log in as B. |
| **Expected** | On the next load of `/student`, A's cached progress is swept and B sees only their own. |

---

## 19. Non-functional & cross-cutting (NFR)

| ID | NFR-01 | Priority | P2 |
|---|---|---|---|
| **Title** | Loading states, not blank screens |
| **Steps** | Open each major page on a throttled connection. |
| **Expected** | Skeleton placeholders appear, then real content. **No page shows skeletons forever.** |

| ID | NFR-02 | Priority | P1 |
|---|---|---|---|
| **Title** | Backend outage is handled gracefully |
| **Steps** | `docker stop amt-backend`, then use the app; restart afterwards. |
| **Expected** | Understandable error messages; no raw stack traces or blank white pages; recovery after restart without a hard refresh loop. |

| ID | NFR-03 | Priority | P2 |
|---|---|---|---|
| **Title** | Bilingual content is complete |
| **Steps** | Toggle EN/ID across problem statements, MP questions and explanations. |
| **Expected** | Both languages render; no empty strings or fallback placeholders. |

| ID | NFR-04 | Priority | P2 |
|---|---|---|---|
| **Title** | Layout holds on a laptop screen |
| **Steps** | Test at 1366×768 and 1920×1080; collapse the sidebar. |
| **Expected** | No horizontal scrolling of the page body; tables/code scroll within their own container; the editor remains usable. |

| ID | NFR-05 | Priority | P2 |
|---|---|---|---|
| **Title** | Responsiveness under classroom load |
| **Steps** | Several students working simultaneously (or repeated rapid submissions). |
| **Expected** | Submissions complete in a reasonable time; no timeouts; analytics still load. |

| ID | NFR-06 | Priority | P1 |
|---|---|---|---|
| **Title** | Student personal data is not exposed to peers |
| **Steps** | Review student-facing pages for any other student's name, code or score. |
| **Expected** | A student sees only their own work anywhere in the student area. |

| ID | NFR-07 | Priority | P3 |
|---|---|---|---|
| **Title** | Health/status page |
| **Steps** | Open `/status`. |
| **Expected** | Accurately reports service reachability. |

---

## 20. Regression checklist (run before every release)

- [ ] AUTH-01, AUTH-07, AUTH-08 — login and role boundaries
- [ ] MPQ-01, MPQ-04 — MP gate and completion unlock PS
- [ ] MPQ-09 — MP quiz is never blank (tag-vocabulary fallback)
- [ ] PSV-02, PSV-03 — run/submit verdicts
- [ ] SUB-02, SUB-03, SUB-05 — submit, read-only, reference-solution gate
- [ ] CHK-01, CHK-02 — publish gate and password
- [ ] INT-01 — exactly one warning per switch
- [ ] SHR-02, SHR-05 — history renders, profile populated
- [ ] IHM-01/02/03 — all three selection modes
- [ ] IAN-01, IAN-06 — analytics and teacher scoping
- [ ] XLS-02, XLS-03 — import and idempotency
- [ ] RSC-02, RSC-04 — roster provisioning and immediate scoping
- [ ] **ISO-01 … ISO-06 — data isolation (never skip)**

---

## 21. Defect log

| # | Test ID | Severity | Summary | Steps to reproduce | Expected | Actual | Status | Owner |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | Open | |
| 2 | | | | | | | Open | |

**Severity:** Critical (blocks release / data loss / data leak between students) · Major (core journey broken, no workaround) · Minor (workaround exists) · Cosmetic.

---

## 22. Traceability

| Requirement source | Covered by |
|---|---|
| P3 — homework workflow, MP/PS phases, submit, tab detector, history split | §3, §4, §5, §6, §9, §10 |
| P4 — self-review route, overdue state, tab-detector fix, roster seeding | SUB-02/03/05, SHW-05, INT-01/03, §15 |
| P5 R1 — option-level misconception triggers + MP template | MPQ-07/08/09, XLS-05/06/07 |
| P5 R2 — per-student dashboard isolation | §18 (ISO-01…07), CHK-04 |
| P5 R3 — misconception profile + study recommendations | SHR-05…SHR-10 |
| UC4 — teacher class scoping | IAN-06, RSC-04 |
| Security / BOLA | AUTH-07, AUTH-08, NFR-06, ISO-06 |

---

## 23. Exit criteria & sign-off

UAT is accepted when:

1. **100 % of P1 cases pass.** No open Critical or Major defect.
2. All §18 isolation cases pass — a shared lab browser never leaks one student's state to another.
3. P2 pass rate ≥ 90 %, with every failure logged, triaged and scheduled.
4. P3 failures are logged and accepted as known issues.
5. The regression checklist (§20) passes on the release build.

| Role | Name | Signature | Date |
|---|---|---|---|
| UAT Lead | | | |
| Course Instructor | | | |
| Researcher / Product Owner | | | |
| Technical Lead | | | |

---

## Appendix A — Useful verification queries **[Technical]**

```bash
# MP answers with the misconceptions each choice revealed (P5)
docker exec amt-postgres psql -U postgres -d postgres -c \
 "select u.username, a.misconception_tag, a.selected_option, a.status, a.triggered_tags, a.timestamp
  from student_mp_attempts a join users u on u.id=a.user_id
  order by a.timestamp desc limit 20;"

# Authored per-option triggers in the question bank (P5)
docker exec amt-postgres psql -U postgres -d postgres -c \
 "select misconception_tag, left(text_en,50) as question, option_misconceptions
  from misconception_questions where option_misconceptions is not null;"

# Pseudocode explanations written by students
docker exec amt-postgres psql -U postgres -d postgres -c \
 "select u.username, a.task_ref, a.passed, a.pseudocode_explanation, a.timestamp
  from attempts a join users u on u.id=a.user_id
  where a.pseudocode_explanation is not null order by a.timestamp desc limit 20;"

# Tab-switch integrity events
docker exec amt-postgres psql -U postgres -d postgres -c \
 "select actor, payload, timestamp from interaction_logs
  where event_type='tab_switch' order by timestamp desc limit 20;"

# Submission finalisation timestamps
docker exec amt-postgres psql -U postgres -d postgres -c \
 "select u.username, p.weekly_target_id, p.mp_status, p.ps_status, p.submitted_at
  from student_homework_progress p join users u on u.id=p.user_id
  order by p.updated_at desc limit 20;"

# Confirm the LLM recommendation path is OFF (P5)
docker exec amt-backend python -c \
 "from app.core.config import settings; print('LLM recommendations enabled:', settings.RECOMMENDATIONS_LLM_ENABLED)"
```

## Appendix B — Known design behaviours (not defects)

| Observation | Explanation |
|---|---|
| A checkpoint is invisible to students | `is_published` is off — the instructor opens it explicitly (P3 gate). |
| An instructor's report dashboard is empty | The account is not matched as a teacher on any course; check LMS participant matching, not the report code. |
| Option **D "Tidak Tahu"** is always scored incorrect | Deliberate: it signals "I don't know" even when a correct option exists. It credits **no** misconception — the typed text is the signal. |
| Reference solutions hidden right after submitting | Deliberate: early submitters must not be able to harvest answers before the deadline. |
| Recommendations wording never varies | Deliberate: the text is staff-reviewed and deterministic; the LLM rephrasing path ships disabled. |
| Pre-P5 MP attempts have empty `triggered_tags` | Deliberate: that evidence was never captured and is not invented retroactively. |
