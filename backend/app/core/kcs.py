# Static list of Knowledge Components (KCs) for introductory python course
# Used for targets, student models, and exercises

K_COMPONENTS = [
    {
        "id": "CO",
        "name": "Constants",
        "topic_area": "Basic Concepts"
    },
    {
        "id": "VA",
        "name": "Variables",
        "topic_area": "Basic Concepts"
    },
    {
        "id": "OP",
        "name": "Operators",
        "topic_area": "Basic Concepts"
    },
    {
        "id": "EX",
        "name": "Expressions",
        "topic_area": "Basic Concepts"
    },
    {
        "id": "IO",
        "name": "Input/Output",
        "topic_area": "Basic Concepts"
    },
    {
        "id": "CD",
        "name": "Conditionals",
        "topic_area": "Control Structures"
    },
    {
        "id": "LO",
        "name": "Loops",
        "topic_area": "Control Structures"
    }
]


# Misconception tags used to group detected misconceptions into remediation rounds.
# Each detected misconception code (e.g. "LO-10", "CD-13", "VA-7") shares a prefix
# with a Knowledge Component, so the prefix doubles as the misconception tag.
# SQ (Sequence) is an extra tag with no automatic detector yet — it is populated
# with dummy remedial problems and can be injected for testing (see
# REMEDIATION_DUMMY_SQ in core/config.py).
MISCONCEPTION_TAGS = [
    # study_focus: one actionable sentence per tag — what to review and how to
    # check yourself. Deterministic study guidance for the P5 recommendation
    # panel (plan D7); reviewable by teaching staff, never generated.
    {
        "id": "CO", "name": "Constants",
        "description": "Confusing constants and literal values.",
        "study_focus": "Review the difference between a constant and a variable: a constant is named once and never reassigned — check yourself by finding every place a value could change.",
    },
    {
        "id": "VA", "name": "Variables",
        "description": "Misusing variables, assignment, or naming.",
        "study_focus": "Practice tracing assignments line by line (e.g. x <- x + 3): write down each variable's value after every statement and confirm assignment replaces the old value using the current one.",
    },
    {
        "id": "OP", "name": "Operators",
        "description": "Confusing operators (e.g. assignment vs comparison).",
        "study_focus": "Revisit operator precedence and the difference between assignment (<-) and comparison (==): evaluate small expressions like 5 + 3 * 2 by hand before checking them in code.",
    },
    {
        "id": "EX", "name": "Expressions",
        "description": "Building or evaluating expressions incorrectly.",
        "study_focus": "Break compound expressions into single steps with intermediate variables, then compare your step-by-step result with the one-line version to confirm they match.",
    },
    {
        "id": "IO", "name": "Input/Output",
        "description": "Misusing input/output statements.",
        "study_focus": "Review what read and write actually do: read stores input into a variable, write shows a value — trace a short program and predict its exact output before running it.",
    },
    {
        "id": "CD", "name": "Conditionals",
        "description": "Misusing conditionals (if/elseif/else).",
        "study_focus": "For each if/else you write, list which inputs take which branch, and test one input per branch — including the boundary value where the condition flips.",
    },
    {
        "id": "LO", "name": "Loops",
        "description": "Misusing loops (while/for).",
        "study_focus": "Trace loops with a table (iteration number, counter value, condition result): verify where the counter changes, when the condition turns false, and how many times the body really runs.",
    },
    {
        "id": "SQ", "name": "Sequence",
        "description": "Misreading program order / top-to-bottom structure.",
        "study_focus": "Number each statement and execute them strictly top to bottom on paper: a statement only sees the values that exist at the moment it runs, not values set later.",
    },
]

# Ordered set of valid tag ids, for quick membership checks.
MISCONCEPTION_TAG_IDS = [t["id"] for t in MISCONCEPTION_TAGS]


def misconception_code_to_tag(code: str) -> str | None:
    """Map a detected misconception code to its remediation tag.

    Codes look like "LO-10", "CD-13", "VA-7", "XX-MISSING", or bare "GEN". The tag
    is the KC prefix before the first "-". "XX-MISSING" carries its concept in the
    prefix (e.g. "LO-MISSING"), so the same rule applies. Returns None when the
    prefix is not a known misconception tag (e.g. the generic "GEN" fallback).
    """
    if not code:
        return None
    prefix = code.split("-", 1)[0].strip().upper()
    return prefix if prefix in MISCONCEPTION_TAG_IDS else None


def misconception_tag_name(tag: str) -> str:
    """Human-readable name for a tag id, falling back to the id itself."""
    for t in MISCONCEPTION_TAGS:
        if t["id"] == tag:
            return t["name"]
    return tag


def misconception_tag_guidance(tag: str) -> dict:
    """Full guidance record for a tag id: name, description, study_focus, topic_area.

    topic_area comes from K_COMPONENTS; SQ is a misconception-only tag with no KC
    entry, so it (and any unknown tag) falls back rather than breaking the payload.
    """
    entry = next((t for t in MISCONCEPTION_TAGS if t["id"] == tag), None)
    kc = next((k for k in K_COMPONENTS if k["id"] == tag), None)
    return {
        "tag": tag,
        "name": entry["name"] if entry else tag,
        "description": entry.get("description", "") if entry else "",
        "study_focus": entry.get("study_focus", "") if entry else "",
        "topic_area": kc["topic_area"] if kc else "Program Structure",
    }
