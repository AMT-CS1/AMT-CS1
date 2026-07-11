"""Unit tests for the misconception-remediation core logic (no DB required)."""
import uuid

from app.core.config import settings
from app.core.kcs import misconception_code_to_tag, misconception_tag_name
from app.core.remediation import ordered_tags_from_misconceptions, build_status
from app.models.misconception_question import MisconceptionQuestion
from app.models.remediation import RemediationSession


# --- misconception_code_to_tag -------------------------------------------------

def test_code_to_tag_maps_known_prefixes():
    assert misconception_code_to_tag("LO-10") == "LO"
    assert misconception_code_to_tag("CD-13") == "CD"
    assert misconception_code_to_tag("VA-7") == "VA"
    assert misconception_code_to_tag("SQ-1") == "SQ"


def test_code_to_tag_rejects_unknown_or_generic():
    assert misconception_code_to_tag("GEN") is None
    assert misconception_code_to_tag("XX-MISSING") is None   # XX is not a real tag
    assert misconception_code_to_tag("") is None


def test_tag_name_lookup():
    assert misconception_tag_name("LO") == "Loops"
    assert misconception_tag_name("SQ") == "Sequence"
    assert misconception_tag_name("ZZ") == "ZZ"  # falls back to the id


# --- ordered_tags_from_misconceptions -----------------------------------------

def test_ordered_tags_preserves_detection_order_and_dedups():
    misconceptions = [
        {"code": "LO-10"},
        {"code": "CD-13"},
        {"code": "LO-10"},   # duplicate tag
        {"code": "GEN"},     # dropped (no tag)
    ]
    assert ordered_tags_from_misconceptions(misconceptions) == ["CD", "LO"]


def test_ordered_tags_reverses_order():
    misconceptions = [
        {"code": "CD-13"},
        {"code": "LO-10"},
    ]
    assert ordered_tags_from_misconceptions(misconceptions) == ["LO", "CD"]


def test_ordered_tags_empty_when_no_tagged_misconceptions():
    assert ordered_tags_from_misconceptions([{"code": "GEN"}]) == []
    assert ordered_tags_from_misconceptions([]) == []


def test_dummy_sq_injection_respects_flag(monkeypatch):
    misconceptions = [{"code": "LO-10"}]

    monkeypatch.setattr(settings, "REMEDIATION_DUMMY_SQ", False)
    assert ordered_tags_from_misconceptions(misconceptions) == ["LO"]

    monkeypatch.setattr(settings, "REMEDIATION_DUMMY_SQ", True)
    assert ordered_tags_from_misconceptions(misconceptions) == ["LO", "SQ"]

    # SQ is only appended when there is at least one real misconception.
    assert ordered_tags_from_misconceptions([]) == []


# --- build_status --------------------------------------------------------------

def _question(tag: str) -> MisconceptionQuestion:
    return MisconceptionQuestion(
        id=uuid.uuid4(), misconception_tag=tag,
        text_en="Q?", text_id="Q?", code=None,
        options_en=["a", "b", "c", "d"], options_id=["a", "b", "c", "d"],
        answer_index=0, explanation_en="because", explanation_id="karena",
    )


def _session(tags, current_index=0, completed=False):
    from datetime import datetime
    return RemediationSession(
        user_id=uuid.uuid4(), problem_key="hw-1", tags=tags,
        current_index=current_index, current_question_id=None,
        completed_at=datetime(2026, 7, 11) if completed else None,
    )


def test_build_status_serializes_current_question_without_answer():
    session = _session(["LO", "CD"], current_index=0)
    q = _question("LO")

    status = build_status(session, q)

    assert status.active is True
    assert status.completed is False
    assert status.current_tag == "LO"
    assert status.current_tag_name == "Loops"
    assert status.total_tags == 2
    assert status.current_question is not None
    assert status.current_question.id == q.id
    # The correct answer must never be sent to the client.
    dumped = status.current_question.model_dump()
    assert "answer_index" not in dumped
    assert "answer" not in dumped


def test_build_status_second_tag():
    session = _session(["LO", "CD"], current_index=1)
    status = build_status(session, _question("CD"))
    assert status.current_tag == "CD"
    assert status.active is True
    assert status.completed is False


def test_build_status_completed_hides_question():
    session = _session(["LO", "CD"], current_index=2, completed=True)
    status = build_status(session, _question("CD"))
    assert status.completed is True
    assert status.active is False
    assert status.current_tag is None
    assert status.current_question is None


def test_build_status_none_session_is_inactive():
    status = build_status(None, None)
    assert status.active is False
    assert status.completed is False
