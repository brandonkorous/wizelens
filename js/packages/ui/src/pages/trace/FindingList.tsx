import { type Finding, type FindingKind, insightsOf, isSecurityKind, OWASP_OF, SECURITY_LABELS, securityOf } from "@wizeworks/lens-core/internal";
import { useState } from "react";
import { fmtMs } from "../../format";

const LABELS: Record<FindingKind, string> = {
  error: "Error",
  "n+1-db": "N+1 query",
  "n+1-http": "N+1 HTTP",
  "duplicate-query": "Duplicate",
  "slow-query": "Slow query",
  "db-wait": "Database wait",
  "slow-page": "Slow page",
  ...SECURITY_LABELS,
};

const badgeClass = (kind: FindingKind) => (isSecurityKind(kind) ? "wl-fbadge-security" : `wl-fbadge-${kind.replace("+", "p")}`);

function Row({ f, extra, onSelect }: { f: Finding; extra: boolean; onSelect: (f: Finding) => void }) {
  const security = isSecurityKind(f.kind);
  return (
    <button type="button" className={`wl-insight wl-insight-${f.severity}${extra ? " wl-insight-extra" : ""}`} onClick={() => onSelect(f)}>
      <span className={`wl-fbadge ${badgeClass(f.kind)}`}>{LABELS[f.kind]}</span>
      <span className="wl-insight-title">{f.title}</span>
      <code className="wl-insight-shape">{f.shape}</code>
      {security ? <span className="wl-owasp" title="OWASP Top 10:2025">{OWASP_OF[f.kind as keyof typeof OWASP_OF]}</span> : <span className="wl-insight-ms">{fmtMs(f.totalMs)}</span>}
    </button>
  );
}

/** On a phone a list shows its first two findings and a button for the rest (trace.css). */
function Rows({ list, onSelect }: { list: Finding[]; onSelect: (f: Finding) => void }) {
  const [open, setOpen] = useState(false);
  const fold = !open && list.length > 2;
  return (
    <>
      {list.map((f, i) => <Row key={`${f.kind}-${i}`} f={f} extra={fold && i >= 2} onSelect={onSelect} />)}
      {fold && <button type="button" className="wl-link-btn wl-insights-more" onClick={() => setOpen(true)}>Show all {list.length}</button>}
    </>
  );
}

/** Findings of one trace: errors and insights, then security risks. A click selects the spans the finding is about. */
export function FindingList({ findings, onSelect }: { findings: Finding[]; onSelect: (f: Finding) => void }) {
  if (findings.length === 0) {
    return (
      <section className="wl-insights wl-insights-clean" aria-label="Insights">
        <span className="wl-insight-ok">✓</span> No problems found in this request.
      </section>
    );
  }
  const perf = [...findings.filter((f) => f.kind === "error"), ...insightsOf(findings)];
  const security = securityOf(findings);
  return (
    <>
      {perf.length > 0 && (
        <section className="wl-insights" aria-label="Insights">
          <Rows list={perf} onSelect={onSelect} />
        </section>
      )}
      {security.length > 0 && (
        <section id="wl-security" className="wl-insights" aria-label="Security">
          <h2 className="wl-insights-head">Security risks</h2>
          <Rows list={security} onSelect={onSelect} />
        </section>
      )}
    </>
  );
}
