"""Wikidata REST API v1 data source.
Fetches structured knowledge graph statements and time-series for places and quantitative metrics.
"""
import json
import logging
import os
import re
from pathlib import Path
from typing import Optional

import requests

from ..choose import choose_indicator
from ..models import Claim, Evidence
from .base import Source

log = logging.getLogger("tracer.sources.wikidata")

API = "https://www.wikidata.org/w/rest.php/wikibase/v1"
SEARCH_API = "https://www.wikidata.org/w/api.php"
CACHE = Path(os.getenv("TRACER_CACHE", ".cache"))
MIN_SCORE = 0.45
HEADERS = {
    "User-Agent": "NumberTracer/1.0 (https://github.com/number-tracer; open-source factual verification)"
}
_state = {}


def _get(url, **params):
    for attempt in range(2):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=15)
            r.raise_for_status()
            return r.json()
        except requests.exceptions.RequestException as e:
            if attempt == 1:
                log.warning("Wikidata request failed for %s: %s", url, e)
                return {}


def _cache_dir():
    return Path(os.getenv("TRACER_CACHE", ".cache"))


def _cached(name, build):
    c_dir = _cache_dir()
    f = c_dir / f"{name}.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    try:
        data = build()
    except Exception:
        data = []
    try:
        c_dir.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception:
        pass
    return data


def countries() -> dict:
    f = _cache_dir() / "wikidata_countries.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "india": {"qid": "Q668", "name": "India"},
        "united states": {"qid": "Q30", "name": "United States"},
        "usa": {"qid": "Q30", "name": "United States"},
        "us": {"qid": "Q30", "name": "United States"},
        "china": {"qid": "Q148", "name": "China"},
        "japan": {"qid": "Q17", "name": "Japan"},
        "germany": {"qid": "Q183", "name": "Germany"},
        "united kingdom": {"qid": "Q145", "name": "United Kingdom"},
        "uk": {"qid": "Q145", "name": "United Kingdom"},
        "france": {"qid": "Q142", "name": "France"},
        "brazil": {"qid": "Q155", "name": "Brazil"},
        "russia": {"qid": "Q159", "name": "Russian Federation"},
    }


def indicators() -> list[dict]:
    f = _cache_dir() / "wikidata_indicators.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    return [
        {"id": "P1082", "name": "population", "note": "Number of people inhabiting the place, country, city, or territory."},
        {"id": "P2131", "name": "nominal GDP", "note": "Gross domestic product: value of all final goods and services produced within a nation in a given year."},
        {"id": "P2132", "name": "nominal GDP per capita", "note": "Gross domestic product divided by midyear population."},
        {"id": "P2250", "name": "life expectancy", "note": "Expected life duration at birth in years."},
        {"id": "P3864", "name": "adult literacy rate", "note": "Percentage of population aged 15 years and over who can both read and write."},
        {"id": "P4841", "name": "total fertility rate", "note": "Average number of children that would be born to a woman over her lifetime."},
        {"id": "P2046", "name": "area", "note": "Spatial extent of a territory or region."},
        {"id": "P1081", "name": "Human Development Index", "note": "Composite statistic of life expectancy, education, and per capita income indicators."},
        {"id": "P1198", "name": "unemployment rate", "note": "Proportion of civilian labor force currently unemployed."},
        {"id": "P1125", "name": "Gini coefficient", "note": "Measure of inequality of a distribution, e.g. of income or wealth."},
    ]


def find_country(place: str) -> Optional[dict]:
    if not place:
        return None
    p_lower = place.strip().lower()
    c_map = countries()
    if p_lower in c_map:
        return c_map[p_lower]
    for k, v in c_map.items():
        if k in p_lower or p_lower in k:
            return v

    # Fallback to online search if not in local cache
    params = {
        "action": "wbsearchentities",
        "search": place.strip(),
        "language": "en",
        "type": "item",
        "format": "json",
    }
    data = _get(SEARCH_API, **params)
    results = data.get("search", []) if isinstance(data, dict) else []
    if results:
        top = results[0]
        return {"qid": top.get("id"), "name": top.get("label", place)}
    return None


def rank(metric: str, top=5) -> list[tuple[float, dict]]:
    from sentence_transformers import SentenceTransformer, util  # loaded on first use only
    if "model" not in _state:
        inds = indicators()
        if not inds:
            return []
        try:
            _state["model"] = SentenceTransformer("all-MiniLM-L6-v2", device="cpu", local_files_only=True)
        except Exception:
            _state["model"] = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
        _state["inds"] = inds
        _state["emb"] = _state["model"].encode([i["name"] for i in inds], convert_to_tensor=True)
    q = _state["model"].encode(metric, convert_to_tensor=True)
    sims = util.cos_sim(q, _state["emb"])[0]
    best = sims.argsort(descending=True)[:top].tolist()
    return [(float(sims[i]), _state["inds"][i]) for i in best if float(sims[i]) >= 0.35]


def series(qid: str, prop_id: str) -> list[tuple[int, float]]:
    """Retrieve time-series (year, value) for a specific entity and property."""
    cache_name = f"wd_stmts_{qid}_{prop_id}"

    def build():
        url = f"{API}/entities/items/{qid}/statements"
        return _get(url, property=prop_id)

    stmts_by_prop = _cached(cache_name, build)
    if not isinstance(stmts_by_prop, dict):
        return []

    stmts = stmts_by_prop.get(prop_id, [])
    if not isinstance(stmts, list):
        return []

    rows = []
    for s in stmts:
        if not isinstance(s, dict):
            continue
        val = s.get("value", {}).get("content", {})
        if not isinstance(val, dict):
            continue
        amount = val.get("amount")
        if amount is None:
            continue
        try:
            num = float(amount)
        except (ValueError, TypeError):
            continue

        year = None
        for q in s.get("qualifiers", []):
            if not isinstance(q, dict):
                continue
            if q.get("property", {}).get("id") in ("P585", "P580", "P582"):
                t_str = q.get("value", {}).get("content", {}).get("time", "")
                m = re.search(r"([+-]?\d{4})", str(t_str))
                if m:
                    try:
                        year = int(m.group(1))
                        break
                    except ValueError:
                        pass
        if year is not None:
            rows.append((year, num))

    # Keep latest or sorted unique years
    unique_years = {}
    for y, v in sorted(rows, key=lambda x: x[0]):
        unique_years[y] = v
    return sorted(unique_years.items(), key=lambda x: x[0])


class Wikidata(Source):
    name = "Wikidata"

    def find(self, claim: Claim, provider: Optional[str] = None) -> list[Evidence]:
        if not claim.place:
            return []
        country = find_country(claim.place)
        if not country or not country.get("qid"):
            return []

        ranked = rank(claim.metric, top=5)
        if not ranked:
            return []

        candidates = [
            {"id": ind["id"], "name": ind["name"], "definition": (ind.get("note") or "")[:300]}
            for score, ind in ranked
        ]

        chosen_idx, confidence, reason, chosen_by = choose_indicator(
            claim, candidates, provider=provider, source=self.name
        )
        if chosen_idx is None:
            return []

        score, ind = ranked[chosen_idx]
        s = series(country["qid"], ind["id"])
        if not s:
            return []

        return [
            Evidence(
                source=self.name,
                title=f"{country['name']} {ind['name']} ({ind['id']})",
                score=round(score, 3),
                place=country["name"],
                url=f"https://www.wikidata.org/wiki/{country['qid']}#{ind['id']}",
                series=s,
                note=ind.get("note", ""),
                chosen_by=chosen_by,
                choice_reason=reason,
                confidence=confidence,
            )
        ]
