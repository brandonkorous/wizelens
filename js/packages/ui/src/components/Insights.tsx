import type { Finding, FindingKind } from "@wizeworks/lens-core";
import { fmtMs } from "../format";

const LABELS: Record<FindingKind, string> = {
  error: "Error",
  "n+1-db": "N+1 query",
  "n+1-http": "N+1 HTTP",
  "duplicate-query": "Duplicate",
  "slow-query": "Slow query",
};

export function Insights({ findings, onSelect }: { findings: Finding[]; onSelect: (f: Finding) => void }) {
  if (findings.length === 0) {
    return (
      <section className="insights insights-clean" aria-label="Insights">
        <span className="insight-ok">✓</span> No problems found in this request.
      </section>
    );
  }
  return (
    <section className="insights" aria-label="Insights">
      {findings.map((f, i) => (
        <button key={`${f.kind}-${i}`} type="button" className={`insight insight-${f.severity}`} onClick={() => onSelect(f)}>
          <span className={`badge badge-${f.kind.replace("+", "p")}`}>{LABELS[f.kind]}</span>
          <span className="insight-title">{f.title}</span>
          <code className="insight-shape">{f.shape}</code>
          <span className="insight-ms">{fmtMs(f.totalMs)}</span>
        </button>
      ))}
    </section>
  );
}
