from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class Claim:
    text: str
    place: Optional[str]      # country name in English, or None if unknown
    metric: str               # plain noun phrase, e.g. "adult literacy rate"
    value: float              # normalised, e.g. 1.4 billion -> 1400000000
    unit: Optional[str] = None
    year: Optional[int] = None


@dataclass
class Evidence:
    source: str
    title: str
    url: str
    score: float = 0.0                              # how well the source matches the metric (0-1)
    place: Optional[str] = None
    series: list = field(default_factory=list)      # [(year, value), ...]
    note: str = ""
    chosen_by: str = "similarity"
    choice_reason: str = ""
    confidence: str = ""


@dataclass
class Verdict:
    label: str   # matches | outdated | doesnt_match | cant_verify
    reason: str
    claimed: Optional[float] = None
    matched_year: Optional[int] = None
    matched_value: Optional[float] = None
    latest_year: Optional[int] = None
    latest_value: Optional[float] = None
    agreement: str = "single"                       # confirmed | disagree | single
    sources: list = field(default_factory=list)      # sources the verdict rests on

    def to_dict(self):
        return asdict(self)
