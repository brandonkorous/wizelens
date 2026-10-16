import type { Finding, FindingKind } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";

const LABELS: Record<FindingKind, string> = {
  error: "Error",
  "n+1-db": "N+1 query",
  "n+1-http": "N+1 HTTP",
  "duplicate-query": "Duplicate",
  "slow-query": "Slow query",
};

/** Findings of one trace. A click selects the spans the finding is about. */
export function FindingList({ findings, onSelect }: { findings: Finding[]; onSelect: (f: Finding) => void }) {
  if (findings.length === 0) {
    return (
      <section className="wl-insights wl-insights-clean" aria-label="Insights">
        <span className="wl-insight-ok">✓</span> No problems found in this request.
      </section>
    );
  }
  return (
    <section className="wl-insights" aria-label="Insights">
      {findings.map((f, i) => (
        <button key={`${f.kind}-${i}`} type="button" className={`wl-insight wl-insight-${f.severity}`} onClick={() => onSelect(f)}>
          <span className={`wl-fbadge wl-fbadge-${f.kind.replace("+", "p")}`}>{LABELS[f.kind]}</span>
          <span className="wl-insight-title">{f.title}</span>
          <code className="wl-insight-shape">{f.shape}</code>
          <span className="wl-insight-ms">{fmtMs(f.totalMs)}</span>
        </button>
      ))}
    </section>
  );
}
