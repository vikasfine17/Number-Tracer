"""World Health Organization (WHO) Global Health Observatory (public API, no key)."""
import json
import os
from pathlib import Path
from typing import Optional

import requests

from ..choose import choose_indicator
from ..models import Claim, Evidence
from .base import Source

API = "https://ghoapi.azureedge.net/api"
CACHE = Path(os.getenv("TRACER_CACHE", ".cache"))
MIN_SCORE = 0.45
ALIASES = {
    "usa": "United States",
    "us": "United States",
    "uk": "United Kingdom",
    "russia": "Russian Federation",
    "south korea": "Korea, Rep.",
    "iran": "Iran, Islamic Rep.",
    "egypt": "Egypt, Arab Rep.",
    "vietnam": "Viet Nam",
    "turkey": "Turkiye",
}
_state = {}


def _get(path, **params):
    for attempt in range(2):
        try:
            r = requests.get(API + path, params=params, timeout=30)
            r.raise_for_status()
            return r.json()
        except requests.exceptions.RequestException:
            if attempt == 1:
                return {}


def _cached(name, build):
    f = CACHE / f"{name}.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    try:
        data = build()
    except Exception:
        data = []
    CACHE.mkdir(parents=True, exist_ok=True)
    try:
        f.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception:
        pass
    return data


def countries():
    def build():
        wb_c = CACHE / "wb_countries.json"
        if wb_c.exists():
            return json.loads(wb_c.read_text(encoding="utf-8"))
        res = _get("/Dimension/COUNTRY/DimensionValues")
        vals = res.get("value", []) if isinstance(res, dict) else []
        return [{"iso3": v.get("Code", ""), "name": v.get("Title", "")} for v in vals if v.get("Code")]
    return _cached("who_countries", build)


def indicators():
    def build():
        cached_ind = CACHE / "who_indicators.json"
        if cached_ind.exists():
            return json.loads(cached_ind.read_text(encoding="utf-8"))
        res = _get("/Indicator")
        vals = res.get("value", []) if isinstance(res, dict) else []
        return [{"id": i.get("IndicatorCode", ""), "name": i.get("IndicatorName", ""), "note": ""} for i in vals[:500]]
    return _cached("who_indicators", build)


def find_country(place):
    p = ALIASES.get(place.lower().strip(), place).lower().strip()
    cs = countries()
    for c in cs:
        if c["name"].lower() == p:
            return c
    for c in cs:
        if p in c["name"].lower():
            return c
    return None


def rank(metric, top=5):
    from sentence_transformers import SentenceTransformer, util   # loaded on first use only
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


def series(iso3, ind_id):
    try:
        data = _get(f"/{ind_id}", **{"$filter": f"SpatialDim eq '{iso3}'"})
        rows = data.get("value", []) if isinstance(data, dict) else []
        out = []
        for r in rows:
            val = r.get("NumericValue")
            time_dim = r.get("TimeDim")
            if val is not None and time_dim is not None:
                try:
                    out.append((int(time_dim), float(val)))
                except (ValueError, TypeError):
                    continue
        return sorted(out, key=lambda x: x[0])
    except Exception:
        return []


class WHO(Source):
    name = "World Health Organization"

    def find(self, claim: Claim, provider: Optional[str] = None) -> list[Evidence]:
        if not claim.place:
            return []
        country = find_country(claim.place)
        if not country:
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
        s = series(country["iso3"], ind["id"])
        if not s:
            return []
        return [
            Evidence(
                source=self.name,
                title=ind["name"],
                score=round(score, 3),
                place=country["name"],
                url=f"https://www.who.int/data/gho/data/indicators/indicator-details/GHO/{ind['id']}",
                series=s,
                note=ind.get("note", ""),
                chosen_by=chosen_by,
                choice_reason=reason,
                confidence=confidence,
            )
        ]
