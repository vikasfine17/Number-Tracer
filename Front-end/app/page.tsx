"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "./Chart";
import DatasetPanel from "./DatasetPanel";
import Dropdown, { DropdownOption } from "./Dropdown";
import Modal from "./Modal";
import Tooltip from "./Tooltip";
import { API_DEFAULT, LABEL, Label, Result, fmt, fmtWords, judgeSeries, splitClaim, useCount } from "./lib";

const EXAMPLES = [
  "India's population is 1.4 billion",
  "Life expectancy in India is 90 years",
  "China's population is 2 billion",
];

const STEPS = [
  "Reading the claim",
  "Finding the dataset",
  "Comparing the numbers",
];

const MODEL_OPTIONS: DropdownOption[] = [
  {
    value: "ollama",
    label: "Ollama (Gemma)",
    sublabel: "Local open-weight model",
    badge: "Offline",
    badgeColor: "ok",
  },
  {
    value: "gemini",
    label: "Gemini",
    sublabel: "Cloud model via API",
    badge: "Cloud",
    badgeColor: "blue",
  },
];

function Icon({ label }: { label: Label }) {
  const p = {
    matches: <path d="M4 12.5l5 5L20 6.5" />,
    outdated: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    doesnt_match: <path d="M6 6l12 12M18 6L6 18" />,
    cant_verify: <path d="M9.5 9a2.7 2.7 0 1 1 3.8 2.5c-.9.5-1.3 1-1.3 2M12 17.5v.01" />,
  }[label];
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      {p}
    </svg>
  );
}

function Num({ n, unit }: { n: number; unit: string | null }) {
  const v = useCount(n);
  return <>{fmt(v, unit)}</>;
}

export default function Home() {
  const [text, setText] = useState("");
  const [provider, setProvider] = useState("ollama");
  const [api, setApi] = useState(API_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [shown, setShown] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [copied, setCopied] = useState(false);
  const [showMethodologyModal, setShowMethodologyModal] = useState(false);
  const [selectedDatasetIdx, setSelectedDatasetIdx] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const m = (e: PointerEvent) => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        document.documentElement.style.setProperty("--mx", e.clientX + "px");
        document.documentElement.style.setProperty("--my", e.clientY + "px");
      });
    };
    window.addEventListener("pointermove", m);
    return () => window.removeEventListener("pointermove", m);
  }, []);

  useEffect(() => {
    setSelectedDatasetIdx(0);
  }, [res]);

  async function run(t?: string) {
    const q = (t ?? text).trim();
    if (!q || busy) return;
    setText(q);
    setShown(q);
    setBusy(true);
    setErr("");
    setRes(null);
    setStep(0);
    const timers = [
      setTimeout(() => setStep(1), 900),
      setTimeout(() => setStep(2), 2600),
    ];
    try {
      const r = await fetch(`${api}/trace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: q, provider }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setRes(await r.json());
    } catch {
      setErr(`Couldn't reach the tracer at ${api}. Start it with: uvicorn tracer.api:app --port 8000`);
    } finally {
      timers.forEach(clearTimeout);
      setBusy(false);
    }
  }

  const datasets = useMemo(
    () => res?.evidence.filter((e) => e.series.length).sort((a, b) => b.score - a.score) ?? [],
    [res]
  );
  const papers = useMemo(() => res?.evidence.filter((e) => !e.series.length) ?? [], [res]);
  const activeDataset = datasets[selectedDatasetIdx] ?? datasets[0];

  const currentVerdict = useMemo(() => {
    if (!res?.claim || !activeDataset) return res?.verdict ?? null;
    if (selectedDatasetIdx === 0 && res.verdict) return res.verdict;
    return judgeSeries(res.claim, activeDataset.series);
  }, [res, activeDataset, selectedDatasetIdx]);

  const v = currentVerdict;
  const [before, hit, after] = res ? splitClaim(shown, res.claim?.year ?? null) : [shown, "", ""];
  const real = v ? (v.matched_value ?? v.latest_value) : null;
  const realYear = v ? (v.matched_value !== null ? v.matched_year : v.latest_year) : null;
  const compact = busy || !!res || !!err;

  // Trajectory analytics calculated deterministically
  const trajectoryStats = useMemo(() => {
    if (!activeDataset?.series?.length) return null;
    const sorted = [...activeDataset.series].sort((a, b) => a[0] - b[0]);
    const minYear = sorted[0][0];
    const maxYear = sorted[sorted.length - 1][0];
    const baselineVal = sorted[0][1];
    const peak = sorted.reduce((best, cur) => cur[1] > best[1] ? cur : best, sorted[0]);
    const latest = sorted[sorted.length - 1];
    const tenYearsAgo = sorted.find((p) => p[0] === latest[0] - 10) ?? (sorted.length > 10 ? sorted[sorted.length - 11] : null);
    const tenYearGrowth = tenYearsAgo && tenYearsAgo[1] && latest[1] ? ((latest[1] - tenYearsAgo[1]) / tenYearsAgo[1]) * 100 : null;
    return {
      minYear,
      maxYear,
      totalPoints: sorted.length,
      baselineVal,
      baselineYear: minYear,
      peakVal: peak[1],
      peakYear: peak[0],
      tenYearGrowth,
    };
  }, [activeDataset]);

  function copy() {
    if (!v) return;
    const s = `${shown} → ${LABEL[v.label]}. ${v.reason}${activeDataset ? ` Source: ${activeDataset.title} (${activeDataset.url})` : ""}`;
    navigator.clipboard.writeText(s).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="wrap">
      <header>
        <div className="header-brand">
          <span className="mark">Number Tracer</span>
          <Tooltip content="Live synchronizer connected to World Bank WDI & OpenAlex APIs">
            <span className="header-tag live-pulse-wrapper">
              <span className="live-pulse-dot" aria-hidden="true" />
              <span>Open Verification Engine</span>
            </span>
          </Tooltip>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="nav-action-btn"
            onClick={() => setShowMethodologyModal(true)}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>How it works</span>
          </button>

          <Tooltip content={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
            <button
              className="ghost theme-toggle-btn"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <>
                  <svg className="theme-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <svg className="theme-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          </Tooltip>
        </div>
      </header>

      <main>
        <section className={"ask" + (compact ? " compact" : "")}>
          {!compact && (
            <>
              <h1>
                <span className="ln"><span>Follow any number</span></span>
                <span className="ln"><span>back to its source.</span></span>
              </h1>
              <p className="sub">
                Paste a statistic. Number Tracer finds the open dataset behind it, compares the figures, and tells you if the claim holds. A model only reads your sentence. The verdict is plain arithmetic.
              </p>
            </>
          )}

          {compact && (
            <div className="compact-header-bar">
              <span className="chb-title">Trace another claim</span>
              <span className="chb-sub">Deterministic arithmetic check against World Bank &amp; OpenAlex</span>
            </div>
          )}

          <div className="field-container">
            <div className="field">
              <textarea
                aria-label="A statistic to check"
                rows={compact ? 1 : 2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    run();
                  }
                }}
                placeholder={compact ? "Enter another statistic to verify..." : "e.g. India's literacy rate is 77%"}
              />

              {text.trim() && !busy && (
                <Tooltip content="Clear input text">
                  <button
                    type="button"
                    className="clear-input-btn"
                    onClick={() => setText("")}
                    aria-label="Clear claim text"
                  >
                    ×
                  </button>
                </Tooltip>
              )}

              <button
                className="go"
                onClick={() => run()}
                disabled={busy || !text.trim()}
                aria-label={busy ? "Tracing claim..." : compact ? "Verify claim" : "Trace this number"}
              >
                {busy ? (
                  <>
                    <svg className="spin-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                    </svg>
                    <span>Tracing…</span>
                  </>
                ) : compact ? (
                  "Verify"
                ) : (
                  "Trace this number"
                )}
              </button>
            </div>

            {!compact && (
              <div className="field-hint-bar">
                <span>Tip: Include the metric and place (e.g. &ldquo;Japan's fertility rate is 1.3&rdquo;)</span>
                <span className="kbd-shortcut">Enter ↵</span>
              </div>
            )}
          </div>

          {!compact && (
            <div className="ex-wrap">
              <span className="ex-label">Try an example:</span>
              <div className="ex">
                {EXAMPLES.map((x) => (
                  <button key={x} onClick={() => run(x)}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
          )}

          <details className="settings-details">
            <summary className="settings-summary">
              <svg className="summary-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span>Settings &amp; Engine</span>
              <span className="settings-active-model-tag">
                {provider === "gemini" ? "Gemini" : "Gemma (Ollama)"}
              </span>
            </summary>
            <div className="set">
              <Dropdown
                label="Extraction Model"
                options={MODEL_OPTIONS}
                value={provider}
                onChange={setProvider}
              />
              <label>
                Tracer address
                <input type="text" value={api} onChange={(e) => setApi(e.target.value)} />
              </label>
            </div>
          </details>
        </section>

        {err && <p className="err" role="alert">{err}</p>}

        {busy && (
          <section className="tracing" aria-live="polite">
            <div className="card tracing-card">
              <span className="tracing-kicker">Tracing Claim</span>
              <div className="scan-track">
                <div className="scan-beam" aria-hidden="true" />
              </div>
              <p className="claim">{shown}</p>
              <ol className="steps">
                {STEPS.map((s, i) => {
                  const state = i < step ? "done" : i === step ? "on" : "todo";
                  return (
                    <li key={s} data-s={state}>
                      <span className="step-indicator" aria-hidden="true">
                        {state === "done" && (
                          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      <span>{s}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Geometry-matched skeleton shimmer preview */}
            <div className="result skeleton-preview" aria-hidden="true">
              <div className="main">
                <div className="card sk-card">
                  <div className="sk-shimmer-box sk-line sk-kicker" />
                  <div className="sk-shimmer-box sk-line sk-title" />
                  <div className="sk-shimmer-box sk-line" style={{ width: "90%" }} />
                  <div className="sk-shimmer-box sk-line" style={{ width: "65%" }} />
                  <div className="nums" style={{ marginTop: "12px" }}>
                    <div className="sk-shimmer-box" style={{ height: "72px" }} />
                    <div className="sk-shimmer-box" style={{ height: "72px" }} />
                  </div>
                </div>
                <div className="card sk-card">
                  <div className="sk-shimmer-box sk-line sk-kicker" />
                  <div className="sk-shimmer-box sk-chart-mock" />
                </div>
              </div>
              <div className="dataset-panel">
                <div className="card sk-card">
                  <div className="sk-shimmer-box sk-line sk-kicker" />
                  <div className="sk-shimmer-box sk-line sk-title" />
                  <div className="sk-shimmer-box" style={{ height: "120px", marginTop: "12px" }} />
                </div>
              </div>
            </div>
          </section>
        )}

        {res && v && !busy && (
          <section className="result" aria-live="polite">
            <div className="main">
              {/* Verdict Summary Card */}
              <div className="card verdict-card rise" style={{ ["--d" as string]: "0s" }}>
                <div className="vc-top">
                  <div className="vc-claim-wrap">
                    <div className="vc-badges-strip">
                      {res.claim?.place && (
                        <span className="vc-meta-chip">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          <span>{res.claim.place}</span>
                        </span>
                      )}
                      {res.claim?.metric && (
                        <span className="vc-meta-chip">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                          <span>{res.claim.metric}</span>
                        </span>
                      )}
                      <span className="vc-meta-chip">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span>{res.claim?.year ? `Claimed Year: ${res.claim.year}` : `Benchmark: ${realYear ?? "Latest"}`}</span>
                      </span>
                      <span className="vc-meta-chip verified-tag">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        <span>Arithmetic Verification</span>
                      </span>
                    </div>

                    <p className="claim">
                      {before}
                      {hit && <mark>{hit}</mark>}
                      {after}
                    </p>
                  </div>

                  <div className={`stamp ${v.label}`}>
                    <Icon label={v.label} />
                    <span>{LABEL[v.label]}</span>
                  </div>
                </div>

                {/* Consensus agreement indicator if crosscheck data exists */}
                {v.agreement && (
                  <div className={`vc-agreement-banner ${v.agreement}`}>
                    {v.agreement === "confirmed" ? (
                      <>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          <path d="M9 12l2 2 4-4" />
                        </svg>
                        <span>
                          <b>Multi-Source Consensus:</b> {v.sources && v.sources.length > 1 ? v.sources.join(" and ") : "Independent open datasets"} confirm and agree with this finding.
                        </span>
                      </>
                    ) : v.agreement === "disagree" ? (
                      <>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span>
                          <b>Cross-Check Conflict:</b> Authoritative sources report differing numbers for this metric.
                        </span>
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <span>
                          <b>Primary Record:</b> Verified against {activeDataset?.source ?? "authoritative open indicators"}.
                        </span>
                      </>
                    )}
                  </div>
                )}

                <div className="vc-divider" />

                <p className="reason">{v.reason}</p>

                {v.claimed !== null && real !== null && (
                  <>
                    <div className="nums">
                      <div className="num-box">
                        <small className="num-label">Claimed Value</small>
                        <div className="num-val-group">
                          <b className="num-val">
                            <Num n={v.claimed} unit={res.claim?.unit ?? null} />
                          </b>
                          <span className="num-words-badge">{fmtWords(v.claimed, res.claim?.unit ?? null)}</span>
                        </div>
                        <span className="num-sub">
                          {new Intl.NumberFormat("en").format(v.claimed)} {res.claim?.unit ?? ""} • Extracted figure
                        </span>
                      </div>
                      <div className="num-box official">
                        <small className="num-label">Official Record{realYear ? ` (${realYear})` : ""}</small>
                        <div className="num-val-group">
                          <b className="num-val">
                            <Num n={real} unit={res.claim?.unit ?? null} />
                          </b>
                          <span className="num-words-badge official">{fmtWords(real, res.claim?.unit ?? null)}</span>
                        </div>
                        <span className="num-sub">
                          {new Intl.NumberFormat("en").format(real)} {res.claim?.unit ?? ""} • {activeDataset?.source ?? "World Bank WDI"}
                        </span>
                      </div>
                    </div>

                    {/* Mathematical Precision Breakdown */}
                    <div className="arithmetic-card">
                      <div className="ac-header">
                        <span className="ac-title">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>
                          Arithmetic Verification Formula
                        </span>
                        <span className="ac-badge">Strict Math — Zero Model Hallucination</span>
                      </div>
                      <div className="ac-grid">
                        <div className="ac-item">
                          <span className="ac-lbl">Absolute Difference</span>
                          <b className="ac-val">{fmtWords(Math.abs(real - v.claimed), res.claim?.unit ?? null)}</b>
                          <small className="ac-sub">Δ {new Intl.NumberFormat("en").format(Math.abs(real - v.claimed))}</small>
                        </div>
                        <div className="ac-item">
                          <span className="ac-lbl">Relative Variance</span>
                          <b className="ac-val">
                            {((Math.abs(real - v.claimed) / real) * 100).toFixed(2)}%
                          </b>
                          <small className="ac-sub">|Actual - Claimed| / Actual</small>
                        </div>
                        <div className="ac-item">
                          <span className="ac-lbl">Allowed Margin</span>
                          <b className="ac-val">
                            {res.claim?.unit === "%" ? "±1.0 pp" : "±5.0% tolerance"}
                          </b>
                          <small className="ac-sub">Deterministic criteria</small>
                        </div>
                        <div className="ac-item highlight">
                          <span className="ac-lbl">Statistical Outcome</span>
                          <b className={`ac-val ${v.label}`}>
                            {((Math.abs(real - v.claimed) / real) * 100) <= 5.0 ? "Within Margin" : "Variance Exceeded"}
                          </b>
                          <small className="ac-sub">{LABEL[v.label]}</small>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Chart Card */}
              {activeDataset && v.claimed !== null && (
                <div className="card chart-card rise" style={{ ["--d" as string]: ".1s" }}>
                  <div className="chart-header">
                    <div>
                      <h3 className="chart-title">Historical Time-Series Trajectory</h3>
                      <p className="chart-sub">Annual chronological records verified from official reporting bodies</p>
                    </div>
                    {datasets.length > 1 && (
                      <span className="ds-pill-active">
                        Indicator: <b>{activeDataset.title}</b>
                      </span>
                    )}
                  </div>
                  <Chart
                    key={activeDataset.title + shown}
                    series={activeDataset.series}
                    claimed={v.claimed}
                    unit={res.claim?.unit ?? null}
                    matchedYear={v.matched_year}
                    label={v.label}
                  />
                  <div className="chart-meta-bar">
                    <p className="hint">
                      Hover or use Left/Right arrows to inspect annual figures. Dashed horizontal line represents claimed figure ({fmtWords(v.claimed, res.claim?.unit ?? null)}).
                    </p>
                  </div>

                  {/* Rich Trajectory Analytics */}
                  {trajectoryStats && (
                    <div className="chart-insights-strip">
                      <div className="ci-box">
                        <span className="ci-lbl">Historical Span</span>
                        <b className="ci-val">{trajectoryStats.minYear} – {trajectoryStats.maxYear}</b>
                        <small className="ci-sub">{trajectoryStats.totalPoints} verified annual records</small>
                      </div>
                      <div className="ci-box">
                        <span className="ci-lbl">All-Time Peak</span>
                        <b className="ci-val">{fmtWords(trajectoryStats.peakVal, res.claim?.unit ?? null)}</b>
                        <small className="ci-sub">Recorded in {trajectoryStats.peakYear}</small>
                      </div>
                      <div className="ci-box">
                        <span className="ci-lbl">All-Time Baseline</span>
                        <b className="ci-val">{fmtWords(trajectoryStats.baselineVal, res.claim?.unit ?? null)}</b>
                        <small className="ci-sub">Recorded in {trajectoryStats.baselineYear}</small>
                      </div>
                      <div className="ci-box">
                        <span className="ci-lbl">10-Year Velocity</span>
                        <b className="ci-val">
                          {trajectoryStats.tenYearGrowth !== null ? `${trajectoryStats.tenYearGrowth >= 0 ? "+" : ""}${trajectoryStats.tenYearGrowth.toFixed(1)}%` : "N/A"}
                        </b>
                        <small className="ci-sub">Decadal trajectory</small>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!activeDataset && (
                <div className="card empty-card rise" style={{ ["--d" as string]: ".1s" }}>
                  <h3>No matching time-series indicator found</h3>
                  <p className="sub">
                    Try phrasing with a country and standard indicator (e.g., population, GDP, life expectancy, or literacy).
                  </p>
                </div>
              )}
            </div>

            <DatasetPanel
              datasets={datasets}
              selectedIdx={selectedDatasetIdx}
              onSelect={setSelectedDatasetIdx}
              papers={papers}
              claim={res.claim}
              verdict={v}
              checks={res.checks}
              onCopySummary={copy}
              copiedSummary={copied}
            />
          </section>
        )}
      </main>

      {/* Methodology & Architecture Modal */}
      <Modal
        isOpen={showMethodologyModal}
        onClose={() => setShowMethodologyModal(false)}
        title="How Number Tracer Works"
        subtitle="Open verification architecture & deterministic arithmetic evaluation"
        size="md"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <h4 style={{ margin: "0 0 6px", fontSize: "16px", color: "var(--ink)" }}>1. Natural Language Extraction</h4>
            <p style={{ margin: 0, color: "var(--mute)", fontSize: "14px" }}>
              When you enter a claim, a language model (Gemma via Ollama or Gemini) parses solely the quantitative assertion—extracting the place, subject metric, claimed numerical value, unit, and referenced year.
            </p>
          </div>

          <div>
            <h4 style={{ margin: "0 0 6px", fontSize: "16px", color: "var(--ink)" }}>2. Semantic Indicator Matching</h4>
            <p style={{ margin: 0, color: "var(--mute)", fontSize: "14px" }}>
              The extracted metric is embedded and matched against thousands of authoritative time-series series in the World Bank World Development Indicators (WDI) and peer-reviewed research in OpenAlex.
            </p>
          </div>

          <div>
            <h4 style={{ margin: "0 0 6px", fontSize: "16px", color: "var(--ink)" }}>3. Multi-Source Cross-Check</h4>
            <p style={{ margin: 0, color: "var(--mute)", fontSize: "14px" }}>
              Independent datasets are cross-checked. A claim is confirmed only when all strong sources agree, eliminating single-source bias.
            </p>
          </div>

          <div>
            <h4 style={{ margin: "0 0 6px", fontSize: "16px", color: "var(--ink)" }}>4. Pure Deterministic Arithmetic</h4>
            <p style={{ margin: 0, color: "var(--mute)", fontSize: "14px" }}>
              Crucially, <b>the model never determines truth</b>. The verdict (Matches, Outdated, Doesn&apos;t match, or Can&apos;t verify) is computed strictly through mathematical comparison against verified historical records, eliminating AI hallucinations.
            </p>
          </div>

          <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: "10px", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--blue)" }}>Open Data Guarantee</span>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--mute)" }}>
              All series are retrieved in real-time from open public APIs under CC-BY 4.0 licenses and can be exported as raw CSV data at any time.
            </p>
          </div>
        </div>
      </Modal>

      <footer>
        <span>Figures synchronized from verified open data APIs (World Bank WDI &amp; OpenAlex).</span>
        <span>Deterministic arithmetic evaluation — zero model hallucinations.</span>
      </footer>
    </div>
  );
}
