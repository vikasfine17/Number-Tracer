"""Turn free text into a structured Claim. Uses the LLM first, regex as a safety net."""
import json
import re
from typing import Optional

from . import llm
from .models import Claim

MULT = {"thousand": 1e3, "lakh": 1e5, "lakhs": 1e5, "million": 1e6, "crore": 1e7,
        "crores": 1e7, "billion": 1e9, "trillion": 1e12}
PLACES = ["India", "China", "United States", "Brazil", "Indonesia", "Pakistan", "Bangladesh", "Nigeria",
          "Russia", "Japan", "Germany", "United Kingdom", "France", "Nepal", "Sri Lanka", "Mexico"]
STOP = {"is", "are", "was", "were", "the", "of", "in", "at", "a", "an", "about", "around", "has", "have",
        "to", "and", "by", "percent", "only", "just", "over", "nearly", "almost", "approximately", "s"}
NUM = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(%|percent|per cent)?\s*(thousand|lakhs?|million|crores?|billion|trillion)?", re.I)
YEAR = re.compile(r"\b(?:19|20)\d{2}\b")

PROMPT = (
    "Extract the one checkable numeric claim from the text below. Reply with JSON only, using exactly these keys: "
    '{"place": country name in English or null, "metric": short generic name of what is measured, '
    '"value": number, "unit": "%" or a short unit or null, "year": integer or null}. '
    "Write the metric as a plain noun phrase without the country or the number "
    '(for example "adult literacy rate", "life expectancy at birth", "population"). '
    'Convert words to plain numbers ("1.4 billion" -> 1400000000, "7 lakh" -> 700000, "3 crore" -> 30000000). '
    'For percentages give the number without the sign and set unit to "%". '
    "Use year only if the text states one, otherwise null. "
    'If there is no checkable number, reply {"value": null}.\n\nText: '
)


def _parse(raw: str) -> Optional[dict]:
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        m = re.search(r"\{.*\}", raw or "", re.S)
        if m:
            try:
                return json.loads(m.group())
            except ValueError:
                return None
    return None


def _from_dict(text: str, d: dict) -> Optional[Claim]:
    try:
        value = float(d.get("value"))
    except (TypeError, ValueError):
        return None
    metric = (d.get("metric") or "").strip() if isinstance(d.get("metric"), str) else ""
    if not metric:
        return None
    unit = d.get("unit")
    if isinstance(unit, str):
        unit = "%" if unit.strip().lower() in ("%", "percent", "percentage", "per cent") else (unit.strip() or None)
    else:
        unit = None
    try:
        year = int(d["year"]) if d.get("year") not in (None, "") else None
    except (TypeError, ValueError):
        year = None
    place = d.get("place")
    place = (place.strip() or None) if isinstance(place, str) else None
    return Claim(text=text, place=place, metric=metric, value=value, unit=unit, year=year)


def fallback(text: str) -> Optional[Claim]:
    """Rough regex extraction, used only when no model is reachable."""
    year_m = YEAR.search(text)
    year = int(year_m.group()) if year_m else None
    cleaned = YEAR.sub(" ", text)
    m = NUM.search(cleaned)
    if not m:
        return None
    value = float(m.group(1).replace(",", ""))
    if m.group(3):
        value *= MULT[m.group(3).lower()]
    place = next((p for p in PLACES if p.lower() in text.lower()), None)
    rest = cleaned[:m.start()] + " " + cleaned[m.end():]
    if place:
        rest = re.sub(re.escape(place) + r"('s)?", " ", rest, flags=re.I)
    words = [w for w in re.sub(r"[^a-zA-Z ]+", " ", rest).split() if w.lower() not in STOP]
    return Claim(text=text, place=place, metric=" ".join(words) or text, value=value,
                 unit="%" if m.group(2) else None, year=year)


def extract(text: str, provider: Optional[str] = None) -> Optional[Claim]:
    raw = llm.complete(PROMPT + text, provider=provider, json_mode=True)
    data = _parse(raw) if raw else None
    claim = _from_dict(text, data) if isinstance(data, dict) else None
    return claim or fallback(text)
