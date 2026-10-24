"""Compare what independent sources say. A claim is only 'confirmed' if every strong source agrees."""
from dataclasses import replace

from .models import Claim, Evidence, Verdict
from .verdict import judge

STRONG = 0.6   # a source must match the metric at least this well to count in the cross-check
TEXT = {"matches": "matches", "outdated": "is outdated", "doesnt_match": "doesn't match", "cant_verify": "can't verify"}


def best_per_source(evidence: list[Evidence]) -> list[Evidence]:
    """Keep each source's best-matching dataset, so one source can't vote twice."""
    best = {}
    for e in evidence:
        if e.series and (e.source not in best or e.score > best[e.source].score):
            best[e.source] = e
    return sorted(best.values(), key=lambda e: -e.score)


def combine(claim: Claim, evidence: list[Evidence]):
    """Return (verdict, checks). `checks` lists what each source said and whether it counted."""
    judged = [(e, judge(claim, e.series)) for e in best_per_source(evidence)]

    def is_strong(e: Evidence) -> bool:
        if getattr(e, "chosen_by", "similarity") == "gemma" and getattr(e, "confidence", "") == "high":
            return True
        return e.score >= STRONG

    strong = [(e, v) for e, v in judged if is_strong(e) and v.label != "cant_verify"]
    used = strong if len(strong) >= 2 else judged[:1]
    names = [e.source for e, _ in used]

    if len(strong) < 2:                          # one source only: same behaviour as before
        verdict = replace(used[0][1], agreement="single", sources=names)
    else:
        supports = {v.label == "matches" for _, v in strong}
        if len(supports) > 1:                    # some say yes, some say no: do not pick a side
            says = " ".join(f"{e.source} {TEXT[v.label]}." for e, v in strong)
            verdict = Verdict("cant_verify", f"The sources disagree, so this can't be confirmed. {says}",
                              claimed=claim.value, agreement="disagree", sources=names)
        else:
            lead = strong[0][1]
            joined = " and ".join(names)
            prefix = f"Confirmed by {joined}. " if lead.label == "matches" else f"{joined} agree the claim doesn't hold. "
            verdict = replace(lead, reason=prefix + lead.reason, agreement="confirmed", sources=names)

    checks = [{"source": e.source, "title": e.title, "score": e.score, "url": e.url, "label": v.label,
               "reason": v.reason, "used": any(e is u for u, _ in used),
               "chosen_by": getattr(e, "chosen_by", "similarity"),
               "choice_reason": getattr(e, "choice_reason", ""),
               "confidence": getattr(e, "confidence", "")} for e, v in judged]
    return verdict, checks
