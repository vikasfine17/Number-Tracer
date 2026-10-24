"use client";
import { useId, useMemo, useState } from "react";
import Tooltip from "./Tooltip";
import { Check, Claim, Evidence, LABEL, Verdict, downloadSeriesCSV, fmt, fmtExact, formatCitation, formatChoiceSentence } from "./lib";

type Props = {
  datasets: Evidence[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  papers: Evidence[];
  claim: Claim | null;
  verdict: Verdict;
  checks?: Check[];
  onCopySummary: () => void;
  copiedSummary: boolean;
};

export default function DatasetPanel({
  datasets,
  selectedIdx,
  onSelect,
  papers,
  claim,
  verdict,
  checks,
  onCopySummary,
  copiedSummary,
}: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "table">("overview");
  const [copiedCitation, setCopiedCitation] = useState(false);
  const [copiedTable, setCopiedTable] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const [yearFilter, setYearFilter] = useState("");
  const overviewTabId = useId();
  const tableTabId = useId();

  const activeDataset = datasets[selectedIdx] ?? datasets[0];

  const seriesSorted = useMemo(() => {
    if (!activeDataset?.series?.length) return [];
    return [...activeDataset.series].sort((a, b) => b[0] - a[0]); // latest first
  }, [activeDataset]);

  const stats = useMemo(() => {
    if (!seriesSorted.length) return null;
    const latest = seriesSorted[0];
    const earliest = seriesSorted[seriesSorted.length - 1];
    const count = seriesSorted.length;
    const growth = earliest[1] && latest[1] ? ((latest[1] - earliest[1]) / earliest[1]) * 100 : null;
    return {
      latestYear: latest[0],
      latestVal: latest[1],
      earliestYear: earliest[0],
      earliestVal: earliest[1],
      count,
      growth,
    };
  }, [seriesSorted]);

  const filteredSeries = useMemo(() => {
    if (!yearFilter.trim()) return seriesSorted;
    return seriesSorted.filter(([year]) => String(year).includes(yearFilter.trim()));
  }, [seriesSorted, yearFilter]);

  const displayedRows = showAllRows ? filteredSeries : filteredSeries.slice(0, 8);

  function handleCopyCitation() {
    if (!activeDataset) return;
    const citation = formatCitation(activeDataset);
    navigator.clipboard.writeText(citation).then(() => {
      setCopiedCitation(true);
      setTimeout(() => setCopiedCitation(false), 2000);
    });
  }

  function handleCopyTable() {
    if (!seriesSorted.length) return;
    const tsv = ["Year\tValue\tFormatted", ...seriesSorted.map(([y, v]) => `${y}\t${v}\t${fmtExact(v, claim?.unit)}`)].join("\n");
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiedTable(true);
      setTimeout(() => setCopiedTable(false), 2000);
    });
  }

  function handleDownloadCSV() {
    if (!activeDataset || !activeDataset.series.length) return;
    downloadSeriesCSV(activeDataset.title, activeDataset.series, claim?.unit);
  }

  const scorePct = activeDataset ? Math.round(activeDataset.score * 100) : 0;
  const scoreClass = scorePct >= 80 ? "high" : scorePct >= 60 ? "medium" : "low";
  const scoreLabel = scorePct >= 80 ? "High match" : scorePct >= 60 ? "Good match" : "Check measure";

  return (
    <aside className="dataset-panel rise" style={{ ["--d" as string]: ".25s" }}>
      {/* Top Header */}
      <div className="dp-header">
        <div className="dp-title-row">
          <div className="dp-heading-group">
            <span className="dp-badge">
              <svg viewBox="0 0 24 24" className="dp-ic" aria-hidden="true">
                <path d="M4 6c0-1.66 3.58-3 8-3s8 1.34 8 3v12c0 1.66-3.58 3-8 3s-8-1.34-8-3V6z" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3M4 18c0 1.66 3.58 3 8 3s8-1.34 8-3" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
              Open Datasets
            </span>
            <span className="dp-count">{datasets.length} found</span>
          </div>
          {activeDataset && (
            <Tooltip content="Open primary data repository in new window">
              <a
                href={activeDataset.url}
                target="_blank"
                rel="noreferrer"
                className="dp-link-btn"
                title="Open dataset at the primary official source"
              >
                <span>Source API</span>
                <svg viewBox="0 0 24 24" className="dp-ic dp-ext-arrow" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </Tooltip>
          )}
        </div>

        {/* Dataset Switcher Tabs when multiple datasets match */}
        {datasets.length > 1 && (
          <div className="dp-selector" role="tablist" aria-label="Available indicators">
            <p className="dp-selector-label">Matching Indicators</p>
            <div className="dp-selector-list">
              {datasets.map((d, i) => {
                const sPct = Math.round(d.score * 100);
                const isSelected = i === selectedIdx;
                return (
                  <button
                    key={d.title + d.url}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`dp-item ${isSelected ? "selected" : ""}`}
                    onClick={() => onSelect(i)}
                  >
                    <div className="dp-item-top">
                      <span className="dp-item-title">{d.title}</span>
                      <span className={`dp-score-tag ${sPct >= 80 ? "high" : sPct >= 60 ? "medium" : "low"}`}>
                        {sPct}%
                      </span>
                    </div>
                    <div className="dp-item-sub">
                      <span>{d.place || d.source}</span>
                      {isSelected && <span className="dp-active-pill">Charted</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Multi-Source Cross-Check Card */}
      {checks && checks.length > 0 && (
        <div className="card dp-card crosscheck-card">
          <div className="dp-crosscheck-header">
            <div className="dp-badge crosscheck">
              <svg viewBox="0 0 24 24" className="dp-ic" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Cross-Check Verification</span>
            </div>
            <span className={`dp-agreement-tag ${verdict.agreement ?? "single"}`}>
              {verdict.agreement === "confirmed"
                ? "Multi-Source Confirmed"
                : verdict.agreement === "disagree"
                ? "Sources Disagree"
                : "Single Source"}
            </span>
          </div>

          <p className="dp-crosscheck-sub">
            {verdict.agreement === "confirmed"
              ? "All strong independent datasets agree on this verdict."
              : verdict.agreement === "disagree"
              ? "Official open datasets report differing numbers for this indicator."
              : "Verified against the primary authoritative open data source."}
          </p>

          <div className="dp-checks-list">
            {checks.map((c) => (
              <div key={c.source + c.title} className={`dp-check-item ${c.used ? "used" : "unused"}`}>
                <div className="dp-check-top">
                  <span className="dp-check-source">{c.source}</span>
                  <span className={`dp-check-badge ${c.label}`}>{LABEL[c.label]}</span>
                </div>
                <div className="dp-check-title">{c.title}</div>
                <div className="dp-check-reason">{c.reason}</div>
                <div className="dp-check-meta">
                  <span className="dp-check-score">Match: {Math.round(c.score * 100)}%</span>
                  <span className={`dp-check-used-tag ${c.used ? "included" : "excluded"}`}>
                    {c.used ? "Included in verdict" : "Auxiliary / weak match"}
                  </span>
                  <a href={c.url} target="_blank" rel="noreferrer" className="dp-check-link">
                    <span>Source</span>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Where this came from Card */}
      {activeDataset && (
        <div className="card dp-card where-from-card">
          <div className="dp-where-header">
            <span className="dp-badge where-badge">
              <svg viewBox="0 0 24 24" className="dp-ic" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              Where this came from
            </span>
            {activeDataset.chosen_by === "gemma" && activeDataset.confidence && (
              <span className={`dp-conf-tag ${activeDataset.confidence}`}>
                {activeDataset.confidence} confidence
              </span>
            )}
          </div>
          <p className="dp-where-text">
            {formatChoiceSentence(activeDataset.chosen_by, activeDataset.choice_reason)}
          </p>
        </div>
      )}

      {activeDataset ? (
        <div className="card dp-card main-card">
          {/* Active Dataset Title & Confidence */}
          <div className="dp-main-header">
            <div>
              <h2 className="dp-name">{activeDataset.title}</h2>
              <div className="dp-tags">
                <span className="dp-tag-source">{activeDataset.source}</span>
                {activeDataset.place && <span className="dp-tag-place">{activeDataset.place}</span>}
              </div>
            </div>
            <Tooltip content="Semantic confidence score calculated against open indicators">
              <div className={`dp-score-pill ${scoreClass}`}>
                <span className="dp-score-num">{scorePct}%</span>
                <span className="dp-score-txt">{scoreLabel}</span>
              </div>
            </Tooltip>
          </div>

          {/* Match Confidence Progress Meter */}
          <div className="dp-meter-box">
            <div className="dp-meter-bar">
              <div className={`dp-meter-fill ${scoreClass}`} style={{ width: `${scorePct}%` }} />
            </div>
            <div className="dp-meter-legend">
              <small>Semantic correlation with claim</small>
              <small>{scorePct}% similarity</small>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="dp-actions-row">
            <Tooltip content="Export complete annual series as CSV">
              <button
                type="button"
                className="dp-action-btn"
                onClick={handleDownloadCSV}
                title="Download full time-series as CSV"
              >
                <svg viewBox="0 0 24 24" className="dp-ic" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>CSV</span>
              </button>
            </Tooltip>

            <Tooltip content="Copy official APA-formatted citation">
              <button
                type="button"
                className="dp-action-btn"
                onClick={handleCopyCitation}
                title="Copy APA-style data citation"
              >
                {copiedCitation ? (
                  <svg viewBox="0 0 24 24" className="dp-ic copy-pop-icon" aria-hidden="true" style={{ color: "var(--ok)" }}>
                    <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="dp-ic" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
                <span>{copiedCitation ? "Copied" : "Cite"}</span>
              </button>
            </Tooltip>

            <Tooltip content="Open authoritative portal at official source">
              <a
                href={activeDataset.url}
                target="_blank"
                rel="noreferrer"
                className="dp-action-btn primary"
                title="View dataset at the original open data portal"
              >
                <span>Open dataset</span>
                <svg viewBox="0 0 24 24" className="dp-ic dp-ext-arrow" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </Tooltip>
          </div>

          {/* Quick Vital Stats Grid */}
          {stats && (
            <div className="dp-stats-grid">
              <div className="dp-stat-box">
                <span className="dp-stat-label">Coverage Span</span>
                <b className="dp-stat-val">{stats.earliestYear} – {stats.latestYear}</b>
                <span className="dp-stat-sub">{stats.count} annual entries</span>
              </div>
              <div className="dp-stat-box">
                <span className="dp-stat-label">Latest Recorded</span>
                <b className="dp-stat-val">{fmt(stats.latestVal, claim?.unit)}</b>
                <span className="dp-stat-sub">Official ({stats.latestYear})</span>
              </div>
              <div className="dp-stat-box">
                <span className="dp-stat-label">Earliest Baseline</span>
                <b className="dp-stat-val">{fmt(stats.earliestVal, claim?.unit)}</b>
                <span className="dp-stat-sub">Official ({stats.earliestYear})</span>
              </div>
              <div className="dp-stat-box">
                <span className="dp-stat-label">Net Trend</span>
                <b className="dp-stat-val">
                  {stats.growth !== null ? `${stats.growth >= 0 ? "+" : ""}${Math.round(stats.growth)}%` : "N/A"}
                </b>
                <span className="dp-stat-sub">Over series lifespan</span>
              </div>
            </div>
          )}

          {/* Tab Navigation for Inspector */}
          <div className="dp-tabs-nav" role="tablist" aria-label="Dataset explorer tabs">
            <button
              id={overviewTabId}
              type="button"
              role="tab"
              aria-selected={activeTab === "overview"}
              aria-controls="panel-overview"
              className={`dp-tab-btn ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              Methodology & Notes
            </button>
            <button
              id={tableTabId}
              type="button"
              role="tab"
              aria-selected={activeTab === "table"}
              aria-controls="panel-table"
              className={`dp-tab-btn ${activeTab === "table" ? "active" : ""}`}
              onClick={() => setActiveTab("table")}
            >
              Data Points ({seriesSorted.length})
            </button>
          </div>

          {/* Tab 1: Methodology Note */}
          {activeTab === "overview" && (
            <div id="panel-overview" role="tabpanel" aria-labelledby={overviewTabId} className="dp-tab-content">
              {activeDataset.note ? (
                <div className="dp-note-callout">
                  <p className="dp-note-title">Official Definition & Scope</p>
                  <p className="dp-note-body">{activeDataset.note}</p>
                </div>
              ) : (
                <p className="dp-note-empty">No extra methodology note provided by this indicator.</p>
              )}
              <div className="dp-provenance">
                <div className="dp-prov-row">
                  <span className="dp-prov-k">Source License</span>
                  <span className="dp-prov-v">Open Data (CC-BY 4.0 / Public Domain)</span>
                </div>
                <div className="dp-prov-row">
                  <span className="dp-prov-k">Data Frequency</span>
                  <span className="dp-prov-v">Annual mid-year series</span>
                </div>
                <div className="dp-prov-row">
                  <span className="dp-prov-k">Retrieved via</span>
                  <span className="dp-prov-v">Authoritative Public API</span>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Raw Data Explorer Table */}
          {activeTab === "table" && (
            <div id="panel-table" role="tabpanel" aria-labelledby={tableTabId} className="dp-tab-content">
              <div className="dp-table-controls">
                <input
                  type="text"
                  placeholder="Filter by year (e.g. 2020)..."
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="dp-filter-input"
                  aria-label="Filter series by year"
                />
                <Tooltip content="Copy tabular data to clipboard">
                  <button
                    type="button"
                    onClick={handleCopyTable}
                    className="dp-sm-btn"
                    title="Copy full series as tab-separated values"
                  >
                    {copiedTable ? "Copied!" : "Copy TSV"}
                  </button>
                </Tooltip>
              </div>

              <div className="dp-table-wrap">
                <table className="dp-table">
                  <thead>
                    <tr>
                      <th style={{ width: "32%" }}>Year</th>
                      <th style={{ width: "38%" }}>Official Figure</th>
                      {claim?.value !== undefined && <th style={{ width: "30%", textAlign: "right" }}>Claim Delta</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.map(([year, val]) => {
                      const isLatest = year === stats?.latestYear;
                      const isMatched = year === verdict.matched_year;
                      const diff = claim?.value ? ((val - claim.value) / claim.value) * 100 : null;
                      return (
                        <tr key={year} className={isMatched ? "matched-row" : isLatest ? "latest-row" : ""}>
                          <td>
                            <span className="dp-cell-year">{year}</span>
                            {isMatched && <span className="dp-table-badge match">Matched</span>}
                            {isLatest && !isMatched && <span className="dp-table-badge latest">Latest</span>}
                          </td>
                          <td className="dp-cell-val">{fmtExact(val, claim?.unit)}</td>
                          {claim?.value !== undefined && (
                            <td className="dp-cell-diff">
                              {diff !== null ? (
                                <span className={`dp-diff-tag ${Math.abs(diff) <= 5 ? "close" : diff > 0 ? "higher" : "lower"}`}>
                                  {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
                                </span>
                              ) : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {displayedRows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="dp-table-empty">No years match &ldquo;{yearFilter}&rdquo;</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {filteredSeries.length > 8 && (
                <button
                  type="button"
                  className="dp-more-btn"
                  onClick={() => setShowAllRows(!showAllRows)}
                >
                  {showAllRows ? "Show fewer rows" : `Show all ${filteredSeries.length} years`}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="card empty-card">
          <div className="dp-empty-icon">
            <svg viewBox="0 0 24 24" className="dp-ic-lg" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v4M12 16h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h3>No matching time-series indicator</h3>
          <p className="sub">
            Number Tracer queries open data repositories (World Bank WDI and OpenAlex). Try phrasing with a specific country and standard development metric such as population, GDP, literacy rate, or life expectancy.
          </p>
        </div>
      )}

      {/* Related Academic Research Literature (OpenAlex) */}
      {papers.length > 0 && (
        <div className="card papers-card">
          <div className="dp-papers-header">
            <div className="dp-badge research">
              <svg viewBox="0 0 24 24" className="dp-ic" aria-hidden="true">
                <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" fill="currentColor" />
              </svg>
              Academic Literature
            </div>
            <span className="dp-count">OpenAlex Index</span>
          </div>
          <p className="dp-papers-sub">Peer-reviewed studies and papers providing context for this statistic:</p>
          <ul className="dp-papers-list">
            {papers.map((p) => {
              const yearMatch = p.title.match(/\b(19\d{2}|20\d{2})\b/);
              const cleanTitle = p.title.replace(/\s*\(\d{4}\)\.?$/, "");
              return (
                <li key={p.url} className="dp-paper-item">
                  <a href={p.url} target="_blank" rel="noreferrer" className="dp-paper-link">
                    <span className="dp-paper-title">{cleanTitle}</span>
                    <div className="dp-paper-meta">
                      {yearMatch && <span className="dp-paper-year">{yearMatch[1]}</span>}
                      <span className="dp-paper-src">View study</span>
                      <svg viewBox="0 0 24 24" className="dp-ic-sm dp-ext-arrow" aria-hidden="true">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Bottom Share / Copy Verification Report */}
      <div className="dp-share-card">
        <Tooltip content="Copy full summary report formatted for sharing">
          <button
            className="ghost wide dp-share-btn"
            onClick={onCopySummary}
            type="button"
            aria-label="Copy verification report summary"
          >
            {copiedSummary ? (
              <svg viewBox="0 0 24 24" className="dp-ic copy-pop-icon" aria-hidden="true" style={{ color: "var(--ok)" }}>
                <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="dp-ic" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            )}
            <span>{copiedSummary ? "Report Copied to Clipboard" : "Copy Complete Verification Report"}</span>
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
