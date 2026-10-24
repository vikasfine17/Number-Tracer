"""Open Government Data (OGD) Platform India (data.gov.in) data source.
Fetches official datasets and time-series for national statistics published by Government of India.
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

log = logging.getLogger("tracer.sources.datagovin")

BASE_API = "https://api.data.gov.in/resource"
CACHE = Path(os.getenv("TRACER_CACHE", ".cache"))
MIN_SCORE = 0.45
DEFAULT_KEY = "579b464db66ec23bdd0000019b9a509e10fc467b6793ad9bcab6c2c1"
_state = {}


def get_api_key() -> str:
    return os.getenv("DATAGOVIN_API_KEY", DEFAULT_KEY)


def _get(resource_id: str, **params):
    api_key = get_api_key()
    url = f"{BASE_API}/{resource_id}"
    req_params = {"api-key": api_key, "format": "json", "limit": 50, **params}
    for attempt in range(2):
        try:
            r = requests.get(url, params=req_params, timeout=30)
            r.raise_for_status()
            return r.json()
        except requests.exceptions.RequestException as e:
            if attempt == 1:
                log.warning("data.gov.in request failed for %s: %s", resource_id, e)
                return {}


def _cache_dir():
    return Path(os.getenv("TRACER_CACHE", ".cache"))


def _cached(name: str, build):
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


def indicators() -> list[dict]:
    f = _cache_dir() / "datagovin_indicators.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    return [
        {
            "id": "1471b575-da71-48f5-b635-f376195e3e86",
            "name": "Literacy Rate in India (NSSO and RGI)",
            "note": "Official literacy rate in India based on NSSO surveys and Registrar General of India (RGI) reports.",
            "type": "row_year",
            "year_col": "state_union_",
            "val_col": "_____rural_persons",
        },
        {
            "id": "c879efff-283c-4a8d-9d03-1668511c2c04",
            "name": "Infant Mortality Rate (IMR) India",
            "note": "Official Sample Registration System (SRS) infant mortality rate per 1,000 live births in India.",
            "type": "col_year",
            "filter_col": "_states_union_territories",
            "filter_val": "ALL INDIA",
        },
        {
            "id": "468e0691-3305-4f0a-869e-4a839a212fbf",
            "name": "Urban Population Percentage",
            "note": "Proportion of urban population to total population in India over decadal censuses.",
            "type": "row_year",
            "year_col": "_year_",
            "val_col": "percent_of_urban_population_to_total_population",
        },
        {
            "id": "07d49df4-233f-4898-92db-e6855d4dd94c",
            "name": "Gross Domestic Product (GDP) of India (Rs Crore)",
            "note": "GDP of India and major sectors of economy in Rs Crore from 1951-52 onward.",
            "type": "row_year",
            "year_col": "financial_year",
            "val_col": "gross_domestic_product_in_rs_cr_at_2004_05_prices",
        },
    ]


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


def parse_series_records(ind_meta: dict, records: list[dict]) -> list[tuple[int, float]]:
    out = []
    ind_type = ind_meta.get("type", "row_year")

    if ind_type == "col_year":
        # Find matching row (All India / targeted state)
        f_col = ind_meta.get("filter_col", "")
        f_val = str(ind_meta.get("filter_val", "ALL INDIA")).lower()
        target_row = None
        for r in records:
            if f_val in str(r.get(f_col, "")).lower():
                target_row = r
                break
        if not target_row and records:
            target_row = records[0]

        if target_row:
            for k, v in target_row.items():
                m = re.search(r"(?:^|[^0-9])(19\d{2}|20\d{2})(?:[^0-9]|$)", k)
                if m:
                    year = int(m.group(1))
                    try:
                        num = float(str(v).replace(",", "").strip())
                        out.append((year, num))
                    except (ValueError, TypeError):
                        pass

    elif ind_type == "row_year":
        y_col = ind_meta.get("year_col", "")
        v_col = ind_meta.get("val_col", "")
        for r in records:
            y_raw = str(r.get(y_col, ""))
            m = re.search(r"(?:^|[^0-9])(19\d{2}|20\d{2})(?:[^0-9]|$)", y_raw)
            if not m:
                continue
            year = int(m.group(1))
            v_raw = r.get(v_col)
            if v_raw in (None, "NA", "-", ""):
                continue
            try:
                num = float(str(v_raw).replace(",", "").strip())
                out.append((year, num))
            except (ValueError, TypeError):
                pass

    unique = {}
    for y, v in sorted(out, key=lambda x: x[0]):
        unique[y] = v
    return sorted(unique.items(), key=lambda x: x[0])


def series(resource_id: str, ind_meta: dict) -> list[tuple[int, float]]:
    cache_name = f"datagovin_{resource_id}"

    def build():
        return _get(resource_id)

    data = _cached(cache_name, build)
    records = data.get("records", []) if isinstance(data, dict) else []
    return parse_series_records(ind_meta, records)


class DataGovIn(Source):
    name = "data.gov.in"

    def find(self, claim: Claim, provider: Optional[str] = None) -> list[Evidence]:
        # data.gov.in specializes in official Indian statistics
        if claim.place:
            p_clean = claim.place.strip().lower()
            if p_clean not in ("india", "ind", "in", "all india"):
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
        s = series(ind["id"], ind)
        if not s:
            return []

        return [
            Evidence(
                source=self.name,
                title=ind["name"],
                score=round(score, 3),
                place="India",
                url=f"https://data.gov.in/resource/{ind['id']}",
                series=s,
                note=ind.get("note", ""),
                chosen_by=chosen_by,
                choice_reason=reason,
                confidence=confidence,
            )
        ]
