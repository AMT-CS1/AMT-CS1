# API Contract: Orchestrator ↔ Vertical Services

This document defines the interface and data shapes between the Orchestrator Platform and the specialized tutoring vertical services:
1. **Feedback Generation Service (P2)**
2. **Problem Generation Service (P3)**

---

## 1. Feedback Generation Contract

### Endpoint: `POST /internal/feedback-request`
Used by the Orchestrator to request Socratic, pedagogical feedback for a student's pseudocode execution results.

### Request Shape
```json
{
  "attempt_id": "11111111-1111-1111-1111-111111111111",
  "learner_state_ref": "22222222-2222-2222-2222-222222222222",
  "kc_focus": "Variables",
  "code": "program Swap\n...",
  "eval_results": {
    "success": true,
    "passed": false,
    "compilation_error": null,
    "test_results": [
      {
        "test_case_index": 1,
        "input": "5\n10",
        "expected": "10\n5",
        "actual": "5\n10",
        "passed": false,
        "error": null
      }
    ]
  }
}
```

### Response Shapes

#### Case A: Success (Pattern Matched)
Returned when the vertical matching logic successfully maps the student error to a pedagogical feedback case.
**HTTP Status:** `200 OK`
```json
{
  "status": "success",
  "feedback_text": "Look at the order of your assignments. You are overwriting the value of x before storing it!",
  "reason": null
}
```

#### Case B: Fallback (No Good Match)
Returned when the vertical matching logic cannot map the student's submission to any specific misconception case.
**HTTP Status:** `200 OK`
```json
{
  "status": "no_match",
  "feedback_text": null,
  "reason": "No matched tutoring pattern or misconception case found for the student's error."
}
```

---

## 2. Problem Generation Contract

### Endpoint: `POST /internal/problem-request`
Used by the Orchestrator to request a new, tailored coding problem/exercise for the student.

### Request Shape
```json
{
  "learner_state_ref": "22222222-2222-2222-2222-222222222222",
  "kc_focus": "Variables",
  "current_difficulty": "medium"
}
```

### Response Shapes

#### Case A: Success (Problem Generated)
Returned when a tailoring strategy matches and generates a specific problem statement.
**HTTP Status:** `200 OK`
```json
{
  "status": "success",
  "exercise_id": "33333333-3333-3333-3333-333333333333",
  "kc_focus": "Variables",
  "problem_statement": "Write a program that swaps two variables using a third variable helper.",
  "difficulty": "medium",
  "reason": null
}
```

#### Case B: Fallback (No Good Match)
Returned when no valid templates or tailored generators match the requested criteria.
**HTTP Status:** `200 OK`
```json
{
  "status": "no_match",
  "exercise_id": null,
  "kc_focus": null,
  "problem_statement": null,
  "difficulty": null,
  "reason": "No tailored problem template matched the student's current model state or requested KC focus."
}
```
