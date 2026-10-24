"""The verdict is plain arithmetic. No model decides whether a number is right."""
from .models import Claim, Verdict


def close(claimed: float, actual: float, unit=None, rel: float = 0.05) -> bool:
    if unit == "%":
        return abs(claimed - actual) <= 1.0          # within one percentage point
    return abs(claimed - actual) <= rel * abs(actual)  # within 5% for counts and amounts


def fmt(v: float, unit=None) -> str:
    if unit == "%":
        s = f"{v:.1f}".rstrip("0").rstrip(".") if abs(v) >= 100 else (f"{v:.2f}".rstrip("0").rstrip(".") if v % 1 != 0 else f"{int(v)}")
        return f"{s}%"
    a = abs(v)
    if a >= 1e12:
        val = v / 1e12
        return f"{val:.2f}".rstrip("0").rstrip(".") + " trillion"
    if a >= 1e9:
        val = v / 1e9
        return f"{val:.2f}".rstrip("0").rstrip(".") + " billion"
    if a >= 1e6:
        val = v / 1e6
        return f"{val:.2f}".rstrip("0").rstrip(".") + " million"
    if a >= 100:
        return f"{int(v):,}" if a.is_integer() else f"{v:,.1f}".rstrip("0").rstrip(".")
    return f"{int(v)}" if a.is_integer() else f"{v:.2f}".rstrip("0").rstrip(".")


def judge(claim: Claim, series) -> Verdict:
    pts = sorted((int(y), float(v)) for y, v in series if v is not None)
    if not pts:
        return Verdict("cant_verify", "The data source has no values for this indicator and place.", claimed=claim.value)
    ly, lv = pts[-1]
    base = dict(claimed=claim.value, latest_year=ly, latest_value=lv)
    u = claim.unit
    ok = lambda v: close(claim.value, v, u)

    if claim.year is not None:
        near = [p for p in pts if abs(p[0] - claim.year) <= 2]
        if not near:
            return Verdict("cant_verify", f"No data near {claim.year}. The series covers {pts[0][0]} to {ly}.", **base)
        y, v = min(near, key=lambda p: (abs(p[0] - claim.year), -p[0]))
        if ok(v):
            return Verdict("matches", f"The source reports {fmt(v, u)} for {y}, which agrees with the claimed {fmt(claim.value, u)}.",
                           matched_year=y, matched_value=v, **base)
        other = [p for p in pts if ok(p[1])]
        extra = f" The claimed figure is closer to the {other[-1][0]} value ({fmt(other[-1][1], u)})." if other else ""
        return Verdict("doesnt_match", f"The source reports {fmt(v, u)} for {y}, not {fmt(claim.value, u)}.{extra}",
                       matched_year=y, matched_value=v, **base)

    if ok(lv):
        return Verdict("matches", f"The latest figure is {fmt(lv, u)} ({ly}), which agrees with the claimed {fmt(claim.value, u)}.",
                       matched_year=ly, matched_value=lv, **base)
    past = [p for p in pts if ok(p[1])]
    if past:
        y, v = past[-1]
        return Verdict("outdated", f"{fmt(claim.value, u)} matches the {y} value ({fmt(v, u)}), but the latest figure is {fmt(lv, u)} ({ly}).",
                       matched_year=y, matched_value=v, **base)
    return Verdict("doesnt_match", f"The latest figure is {fmt(lv, u)} ({ly}). No year in the series is close to {fmt(claim.value, u)}.", **base)
