from unittest.mock import patch

from tracer.models import Claim
from tracer.sources.wikidata import Wikidata, find_country, indicators, series


def test_indicators_loaded():
    inds = indicators()
    assert len(inds) >= 10
    ids = [i["id"] for i in inds]
    assert "P1082" in ids  # population
    assert "P2131" in ids  # nominal GDP
    assert "P2250" in ids  # life expectancy


def test_country_lookup():
    c_in = find_country("India")
    assert c_in is not None
    assert c_in["qid"] == "Q668"

    c_us = find_country("United States")
    assert c_us is not None
    assert c_us["qid"] == "Q30"

    c_alias = find_country("USA")
    assert c_alias is not None
    assert c_alias["qid"] == "Q30"


def test_series_extraction(tmp_path, monkeypatch):
    monkeypatch.setenv("TRACER_CACHE", str(tmp_path))
    sample_stmts = {
        "P1082": [
            {
                "property": {"id": "P1082"},
                "value": {"content": {"amount": "+1380000000"}},
                "qualifiers": [
                    {
                        "property": {"id": "P585"},
                        "value": {"content": {"time": "+2020-00-00T00:00:00Z"}},
                    }
                ],
            },
            {
                "property": {"id": "P1082"},
                "value": {"content": {"amount": "+1400000000"}},
                "qualifiers": [
                    {
                        "property": {"id": "P585"},
                        "value": {"content": {"time": "+2021-00-00T00:00:00Z"}},
                    }
                ],
            },
        ]
    }

    with patch("tracer.sources.wikidata._get", return_value=sample_stmts):
        pts = series("Q668", "P1082")
        assert len(pts) == 2
        assert pts[0] == (2020, 1380000000.0)
        assert pts[1] == (2021, 1400000000.0)


def test_find_with_mock():
    claim = Claim("India population is 1.4 billion", "India", "population", 1400000000.0, None, 2021)
    wd = Wikidata()

    mock_ranked = [(0.95, {"id": "P1082", "name": "population", "note": "Number of people"})]
    mock_series = [(2021, 1400000000.0)]

    with patch("tracer.sources.wikidata.find_country", return_value={"qid": "Q668", "name": "India"}), \
         patch("tracer.sources.wikidata.rank", return_value=mock_ranked), \
         patch("tracer.sources.wikidata.choose_indicator", return_value=(0, "high", "Selected population", "gemma")), \
         patch("tracer.sources.wikidata.series", return_value=mock_series):
        evidence = wd.find(claim)
        assert len(evidence) == 1
        ev = evidence[0]
        assert ev.source == "Wikidata"
        assert ev.series == mock_series
        assert ev.chosen_by == "gemma"
        assert ev.confidence == "high"


def test_find_abstains():
    claim = Claim("India population is 1.4 billion", "India", "population", 1400000000.0, None, 2021)
    wd = Wikidata()

    mock_ranked = [(0.95, {"id": "P1082", "name": "population", "note": "Number of people"})]

    with patch("tracer.sources.wikidata.find_country", return_value={"qid": "Q668", "name": "India"}), \
         patch("tracer.sources.wikidata.rank", return_value=mock_ranked), \
         patch("tracer.sources.wikidata.choose_indicator", return_value=(None, "high", "No indicator matches", "gemma")):
        evidence = wd.find(claim)
        assert evidence == []
