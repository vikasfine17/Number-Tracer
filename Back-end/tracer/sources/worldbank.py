"""World Bank World Development Indicators (public API, no key). Checks numbers."""
import json
import os
from pathlib import Path
from typing import Optional

import requests

from ..choose import choose_indicator
from ..models import Claim, Evidence
from .base import Source

API = "https://api.worldbank.org/v2"
CACHE = Path(os.getenv("TRACER_CACHE", ".cache"))
MIN_SCORE = 0.45   # below this the indicator is too unlike the claim to trust
ALIASES = {"usa": "United States", "us": "United States", "uk": "United Kingdom", "russia": "Russian Federation",
           "south korea": "Korea, Rep.", "iran": "Iran, Islamic Rep.", "egypt": "Egypt, Arab Rep.",
           "vietnam": "Viet Nam", "turkey": "Turkiye"}
_state = {}


def _get(path, **params):
    for attempt in range(2):
        try:
            r = requests.get(API + path, params={"format": "json", **params}, timeout=30)
            r.raise_for_status()
            return r.json()
        except requests.exceptions.RequestException:
            if attempt == 1:
                raise


def _cached(name, build):
    f = CACHE / f"{name}.json"
    if f.exists():
        return json.loads(f.read_text())
    data = build()
    CACHE.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data))
    return data


def _all_pages(path, **params):
    rows, page = [], 1
    while True:
        meta, data = _get(path, page=page, per_page=1000, **params)[:2]
        rows += data or []
        if page >= int(meta.get("pages", 1)):
            return rows
        page += 1


def countries():
    def build():
        return [{"iso3": c["id"], "iso2": c["iso2Code"], "name": c["name"]}
                for c in _all_pages("/country") if c["region"]["value"] != "Aggregates"]
    return _cached("wb_countries", build)


def indicators():
    def build():
        return [{"id": i["id"], "name": i["name"], "note": (i.get("sourceNote") or "")[:300]}
                for i in _all_pages("/indicator", source=2)]
    return _cached("wb_indicators", build)


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
    data = _get(f"/country/{iso3}/indicator/{ind_id}", per_page=100)
    rows = data[1] if len(data) > 1 and data[1] else []
    return [(int(r["date"]), float(r["value"])) for r in rows if r.get("value") is not None]


class WorldBank(Source):
    name = "World Bank WDI"

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
                url=f"https://data.worldbank.org/indicator/{ind['id']}?locations={country['iso2']}",
                series=s,
                note=ind.get("note", ""),
                chosen_by=chosen_by,
                choice_reason=reason,
                confidence=confidence,
            )
        ]
