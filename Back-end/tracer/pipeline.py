import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from typing import Optional

from .crosscheck import combine
from .extract import extract
from .models import Verdict
from .sources import load_sources

log = logging.getLogger("tracer.pipeline")
_sources = []


def get_sources():
    if not _sources:
        _sources.extend(load_sources())
    return _sources


def _run(src, claim, provider=None):
    try:
        import inspect
        sig = inspect.signature(src.find)
        if "provider" in sig.parameters:
            return src.find(claim, provider=provider)
        return src.find(claim)
    except Exception as e:   # one broken source must never break the answer
        log.warning("source %s failed: %s", src.name, e)
        return []


def trace(text: str, provider: Optional[str] = None) -> dict:
    claim = extract(text, provider)
    if claim is None:
        v = Verdict("cant_verify", "I couldn't find a checkable number in that text.")
        return {"claim": None, "verdict": v.to_dict(), "evidence": [], "checks": []}

    srcs = get_sources()
    with ThreadPoolExecutor(max_workers=len(srcs) or 1) as ex:
        evidence = [e for batch in ex.map(lambda s: _run(s, claim, provider), srcs) for e in batch]

    numeric = [e for e in evidence if e.series]
    checks = []
    if numeric:
        verdict, checks = combine(claim, numeric)
    elif not claim.place:
        verdict = Verdict("cant_verify", "I couldn't tell which country this claim is about.", claimed=claim.value)
    else:
        verdict = Verdict("cant_verify", "No open dataset I can reach matches this metric closely enough, so nothing was verified.",
                          claimed=claim.value)
    return {"claim": asdict(claim), "verdict": verdict.to_dict(), "evidence": [asdict(e) for e in evidence], "checks": checks}
