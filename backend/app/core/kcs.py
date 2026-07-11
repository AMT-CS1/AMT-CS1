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
    {"id": "CO", "name": "Constants", "description": "Confusing constants and literal values."},
    {"id": "VA", "name": "Variables", "description": "Misusing variables, assignment, or naming."},
    {"id": "OP", "name": "Operators", "description": "Confusing operators (e.g. assignment vs comparison)."},
    {"id": "EX", "name": "Expressions", "description": "Building or evaluating expressions incorrectly."},
    {"id": "IO", "name": "Input/Output", "description": "Misusing input/output statements."},
    {"id": "CD", "name": "Conditionals", "description": "Misusing conditionals (if/elseif/else)."},
    {"id": "LO", "name": "Loops", "description": "Misusing loops (while/for)."},
    {"id": "SQ", "name": "Sequence", "description": "Misreading program order / top-to-bottom structure."},
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
