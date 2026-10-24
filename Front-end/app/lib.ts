import { useEffect, useRef, useState } from "react";

export type Claim = {
  text: string;
  place: string | null;
  metric: string;
  value: number;
  unit: string | null;
  year: number | null;
};

export type Evidence = {
  source: string;
  title: string;
  url: string;
  score: number;
  place: string | null;
  series: [number, number][];
  note: string;
  chosen_by?: string;
  choice_reason?: string;
  confidence?: string;
};

export type Label = "matches" | "outdated" | "doesnt_match" | "cant_verify";

export type Check = {
  source: string;
  title: string;
  score: number;
  url: string;
  label: Label;
  reason: string;
  used: boolean;
  chosen_by?: string;
  choice_reason?: string;
  confidence?: string;
};

export function formatChoiceSentence(chosenBy?: string, reason?: string): string {
  if (chosenBy === "gemma") {
    if (!reason) {
      return "Gemma chose this dataset.";
    }
    const clean = reason.trim().replace(/^because\s+/i, "").replace(/\.$/, "");
    const lowerFirst = clean.charAt(0).toLowerCase() + clean.slice(1);
    return `Gemma chose this dataset because ${lowerFirst}.`;
  }
  return "Chosen by text similarity.";
}

export type Verdict = {
  agreement?: "confirmed" | "disagree" | "single";
  sources?: string[];
  label: Label;
  reason: string;
  claimed: number | null;
  matched_year: number | null;
  matched_value: number | null;
  latest_year: number | null;
  latest_value: number | null;
};

export type Result = {
  claim: Claim | null;
  verdict: Verdict;
  evidence: Evidence[];
  checks?: Check[];
};

export const API_DEFAULT = process.env.NEXT_PUBLIC_API ?? "http://localhost:8000";
export const LABEL: Record<Label, string> = {
  matches: "Matches",
  outdated: "Outdated",
  doesnt_match: "Doesn't match",
  cant_verify: "Can't verify",
};

export function fmt(n: number, unit?: string | null) {
  const a = Math.abs(n);
  const s =
    a >= 1e6
      ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(n)
      : new Intl.NumberFormat("en", { maximumFractionDigits: a >= 100 ? 0 : 2 }).format(n);
  return s + (unit === "%" ? "%" : "");
}

export function fmtWords(n: number, unit?: string | null): string {
  if (unit === "%") {
    const s = Math.abs(n) >= 100 ? n.toFixed(1).replace(/\.0$/, "") : (n % 1 !== 0 ? n.toFixed(2).replace(/\.?0+$/, "") : String(Math.round(n)));
    return `${s}%`;
  }
  const a = Math.abs(n);
  if (a >= 1e12) {
    const val = (n / 1e12).toFixed(2).replace(/\.?0+$/, "");
    return `${val} trillion`;
  }
  if (a >= 1e9) {
    const val = (n / 1e9).toFixed(2).replace(/\.?0+$/, "");
    return `${val} billion`;
  }
  if (a >= 1e6) {
    const val = (n / 1e6).toFixed(2).replace(/\.?0+$/, "");
    return `${val} million`;
  }
  if (a >= 100) {
    return Number.isInteger(n) ? new Intl.NumberFormat("en").format(n) : new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(n);
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export function fmtExact(n: number, unit?: string | null) {
  const s = new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(n);
  return s + (unit === "%" ? "%" : "");
}

export function close(claimed: number, actual: number, unit?: string | null, rel = 0.05): boolean {
  if (unit === "%") return Math.abs(claimed - actual) <= 1.0;
  return Math.abs(claimed - actual) <= rel * Math.abs(actual);
}

export function judgeSeries(claim: Claim, series: [number, number][]): Verdict {
  const pts = [...series].filter((p) => p[1] !== null && !isNaN(p[1])).sort((a, b) => a[0] - b[0]);
  if (!pts.length) {
    return {
      label: "cant_verify",
      reason: "The data source has no values for this indicator and place.",
      claimed: claim.value,
      matched_year: null,
      matched_value: null,
      latest_year: null,
      latest_value: null,
    };
  }
  const [ly, lv] = pts[pts.length - 1];
  const u = claim.unit;
  const ok = (v: number) => close(claim.value, v, u);

  if (claim.year !== null) {
    const near = pts.filter((p) => Math.abs(p[0] - claim.year!) <= 2);
    if (!near.length) {
      return {
        label: "cant_verify",
        reason: `No data near ${claim.year}. The series covers ${pts[0][0]} to ${ly}.`,
        claimed: claim.value,
        matched_year: null,
        matched_value: null,
        latest_year: ly,
        latest_value: lv,
      };
    }
    const [y, v] = near.reduce((best, cur) =>
      Math.abs(cur[0] - claim.year!) < Math.abs(best[0] - claim.year!) ? cur : best
    );
    if (ok(v)) {
      return {
        label: "matches",
        reason: `The source reports ${fmtWords(v, u)} for ${y}, which agrees with the claimed ${fmtWords(claim.value, u)}.`,
        claimed: claim.value,
        matched_year: y,
        matched_value: v,
        latest_year: ly,
        latest_value: lv,
      };
    }
    const other = pts.filter((p) => ok(p[1]));
    const extra = other.length
      ? ` The claimed figure is closer to the ${other[other.length - 1][0]} value (${fmtWords(other[other.length - 1][1], u)}).`
      : "";
    return {
      label: "doesnt_match",
      reason: `The source reports ${fmtWords(v, u)} for ${y}, not ${fmtWords(claim.value, u)}.${extra}`,
      claimed: claim.value,
      matched_year: y,
      matched_value: v,
      latest_year: ly,
      latest_value: lv,
    };
  }

  if (ok(lv)) {
    return {
      label: "matches",
      reason: `The latest figure is ${fmtWords(lv, u)} (${ly}), which agrees with the claimed ${fmtWords(claim.value, u)}.`,
      claimed: claim.value,
      matched_year: ly,
      matched_value: lv,
      latest_year: ly,
      latest_value: lv,
    };
  }
  const past = pts.filter((p) => ok(p[1]));
  if (past.length) {
    const [y, v] = past[past.length - 1];
    return {
      label: "outdated",
      reason: `${fmtWords(claim.value, u)} matches the ${y} value (${fmtWords(v, u)}), but the latest figure is ${fmtWords(lv, u)} (${ly}).`,
      claimed: claim.value,
      matched_year: y,
      matched_value: v,
      latest_year: ly,
      latest_value: lv,
    };
  }
  return {
    label: "doesnt_match",
    reason: `The latest figure is ${fmtWords(lv, u)} (${ly}). No year in the series is close to ${fmtWords(claim.value, u)}.`,
    claimed: claim.value,
    matched_year: null,
    matched_value: null,
    latest_year: ly,
    latest_value: lv,
  };
}

export function downloadSeriesCSV(title: string, series: [number, number][], unit?: string | null) {
  const sorted = [...series].sort((a, b) => b[0] - a[0]);
  let csv = "Year,Raw_Value,Formatted\n";
  for (const [year, val] of sorted) {
    csv += `${year},${val},"${fmtExact(val, unit)}"\n`;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatCitation(evidence: Evidence): string {
  const dateStr = new Date().getFullYear();
  return `${evidence.source}. "${evidence.title}". ${evidence.place ? `Data for ${evidence.place}. ` : ""}Retrieved from ${evidence.url} (Accessed ${dateStr}).`;
}

export function useCount(target: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      return;
    }
    let id = 0;
    const s = performance.now();
    const t = (now: number) => {
      const p = Math.min((now - s) / ms, 1);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) id = requestAnimationFrame(t);
    };
    id = requestAnimationFrame(t);
    return () => cancelAnimationFrame(id);
  }, [target, ms]);
  return v;
}

/** Split the sentence around the number so it can be highlighted. */
export function splitClaim(text: string, year: number | null): [string, string, string] {
  const re = /\d[\d,]*(?:\.\d+)?\s*(?:%|percent|per cent|thousand|lakhs?|million|crores?|billion|trillion)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const hit = m[0].trimEnd();
    if (year !== null && hit === String(year)) continue;
    return [text.slice(0, m.index), hit, text.slice(m.index + hit.length)];
  }
  return [text, "", ""];
}
