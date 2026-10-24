from tracer.crosscheck import combine
from tracer.models import Claim, Evidence

CLAIM = Claim("t", "India", "literacy", 77.0, "%", None)


def ev(source, value, score=0.9, series=None):
    return Evidence(source, f"{source} dataset", "http://x", score, "India", series or [(2022, value)])


def test_two_sources_agree_confirmed():
    v, checks = combine(CLAIM, [ev("A", 77.0), ev("B", 77.4)])
    assert v.label == "matches" and v.agreement == "confirmed" and v.sources == ["A", "B"]
    assert v.reason.startswith("Confirmed by A and B") and all(c["used"] for c in checks)


def test_two_sources_disagree_refuses_to_pick():
    v, _ = combine(CLAIM, [ev("A", 77.0), ev("B", 60.0)])
    assert v.label == "cant_verify" and v.agreement == "disagree"
    assert "A matches" in v.reason and "B doesn't match" in v.reason


def test_both_say_no_confirmed_wrong():
    v, _ = combine(CLAIM, [ev("A", 60.0), ev("B", 61.0)])
    assert v.label == "doesnt_match" and v.agreement == "confirmed" and "agree the claim doesn't hold" in v.reason


def test_weak_source_does_not_veto():
    v, checks = combine(CLAIM, [ev("A", 77.0), ev("B", 60.0, score=0.5)])
    assert v.label == "matches" and v.agreement == "single" and v.sources == ["A"]
    assert [c["used"] for c in checks] == [True, False]


def test_single_source():
    v, checks = combine(CLAIM, [ev("A", 77.0)])
    assert v.agreement == "single" and len(checks) == 1


def test_same_source_cannot_vote_twice():
    v, checks = combine(CLAIM, [ev("A", 77.0, 0.9), ev("A", 50.0, 0.8)])
    assert v.agreement == "single" and len(checks) == 1


def test_source_without_data_abstains():
    claim = Claim("t", "India", "literacy", 77.0, "%", 1990)
    v, _ = combine(claim, [ev("A", 77.0, series=[(1990, 77.0)]), ev("B", 50.0)])
    assert v.agreement == "single" and v.sources == ["A"]
