from tracer.models import Claim
from tracer.verdict import judge

S = [(2011, 74.0), (2018, 74.4), (2022, 77.0)]


def claim(value, year=None, unit="%"):
    return Claim(text="t", place="India", metric="literacy", value=value, unit=unit, year=year)


def test_matches_latest():
    assert judge(claim(77), S).label == "matches"


def test_outdated():
    v = judge(claim(74), S)
    assert v.label == "outdated" and v.matched_year == 2018 and v.latest_year == 2022


def test_doesnt_match():
    assert judge(claim(50), S).label == "doesnt_match"


def test_year_given_matches():
    assert judge(claim(74, 2011), S).label == "matches"


def test_year_given_wrong_year_points_to_right_one():
    v = judge(claim(74, 2022), S)
    assert v.label == "doesnt_match" and "2018" in v.reason


def test_no_data_near_year():
    assert judge(claim(74, 1990), S).label == "cant_verify"


def test_empty_series():
    assert judge(claim(74), []).label == "cant_verify"


def test_counts_use_five_percent_tolerance():
    assert judge(claim(1.4e9, unit=None), [(2023, 1.438e9)]).label == "matches"
    assert judge(claim(2e9, unit=None), [(2023, 1.438e9)]).label == "doesnt_match"
