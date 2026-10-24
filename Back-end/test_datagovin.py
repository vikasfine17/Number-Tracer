from unittest.mock import patch
import pytest

from tracer.models import Claim
from tracer.sources.datagovin import DataGovIn, indicators, parse_series_records


def test_indicators_loaded():
    inds = indicators()
    assert len(inds) >= 4
    names = [i["name"] for i in inds]
    assert any("Literacy" in n for n in names)
    assert any("Infant Mortality" in n for n in names)
    assert any("GDP" in n for n in names)


def test_parse_col_year():
    meta = {
        "type": "col_year",
        "filter_col": "_states",
        "filter_val": "ALL INDIA",
    }
    records = [
        {"_states": "Assam", "_1971": "139", "_2001": "74"},
        {"_states": "ALL INDIA", "_1971": "129", "_2001": "66", "_2011": "44"},
    ]
    series = parse_series_records(meta, records)
    assert len(series) == 3
    assert series[0] == (1971, 129.0)
    assert series[1] == (2001, 66.0)
    assert series[2] == (2011, 44.0)


def test_parse_row_year():
    meta = {
        "type": "row_year",
        "year_col": "financial_year",
        "val_col": "gdp_val",
    }
    records = [
        {"financial_year": "1951-52", "gdp_val": "286147"},
        {"financial_year": "1952-53", "gdp_val": "294267"},
    ]
    series = parse_series_records(meta, records)
    assert len(series) == 2
    assert series[0] == (1951, 286147.0)
    assert series[1] == (1952, 294267.0)


def test_find_with_mock():
    claim = Claim("India infant mortality rate was 44 in 2011", "India", "infant mortality rate", 44.0, None, 2011)
    dgi = DataGovIn()

    mock_ranked = [(0.92, {"id": "c879efff-283c-4a8d-9d03-1668511c2c04", "name": "Infant Mortality Rate (IMR) India", "note": "SRS IMR"})]
    mock_series = [(2011, 44.0)]

    with patch("tracer.sources.datagovin.rank", return_value=mock_ranked), \
         patch("tracer.sources.datagovin.choose_indicator", return_value=(0, "high", "Selected IMR", "gemma")), \
         patch("tracer.sources.datagovin.series", return_value=mock_series):
        evidence = dgi.find(claim)
        assert len(evidence) == 1
        ev = evidence[0]
        assert ev.source == "data.gov.in"
        assert ev.series == mock_series
        assert ev.chosen_by == "gemma"
        assert ev.confidence == "high"


def test_find_abstains():
    claim = Claim("India literacy is 77%", "India", "literacy", 77.0, "%", 2022)
    dgi = DataGovIn()

    mock_ranked = [(0.9, {"id": "test-id", "name": "Literacy Rate in India", "note": "..."})]

    with patch("tracer.sources.datagovin.rank", return_value=mock_ranked), \
         patch("tracer.sources.datagovin.choose_indicator", return_value=(None, "high", "No indicator matches", "gemma")):
        evidence = dgi.find(claim)
        assert evidence == []


def test_non_india_place_returns_empty():
    claim = Claim("France GDP was 3 trillion in 2021", "France", "gdp", 3000000000000.0, None, 2021)
    dgi = DataGovIn()
    evidence = dgi.find(claim)
    assert evidence == []
