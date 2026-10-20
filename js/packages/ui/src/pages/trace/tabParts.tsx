import { isErrorSpan, isSecurityKind, type Finding, type Span, type Trace } from "@wizeworks/lens-core";
import { serviceSlot } from "../../format";

/** What every span tab gets: the trace, its findings, and the selection. */
export interface TabProps {
  trace: Trace;
  findings: Finding[];
  selected: string | null;
  highlight: ReadonlySet<string>;
  onSelect: (spanId: string) => void;
}

/** Finding kinds per span id. */
export function badgesFor(findings: Finding[]): Map<string, Set<Finding["kind"]>> {
  const map = new Map<string, Set<Finding["kind"]>>();
  for (const f of findings) {
    for (const id of f.spanIds) {
      const set = map.get(id) ?? new Set();
      set.add(f.kind);
      map.set(id, set);
    }
  }
  return map;
}

const BADGE: Partial<Record<Finding["kind"], string>> = {
  "duplicate-query": "DUP",
  "n+1-db": "N+1",
  "n+1-http": "N+1",
  "slow-query": "SLOW",
  "db-wait": "WAIT",
  "sql-injection": "SQLI",
  ssrf: "SSRF",
  "plain-http": "HTTP",
  "secret-in-url": "SECRET",
  "secret-leak": "SECRET",
};

export function FindingBadges({ kinds }: { kinds: Set<Finding["kind"]> | undefined }) {
  if (!kinds) return null;
  return (
    <>
      {[...kinds]
        .filter((k) => BADGE[k])
        .map((k) => (
          <span key={k} className={`wl-fbadge ${isSecurityKind(k) ? "wl-fbadge-security" : `wl-fbadge-${k.replace("+", "p")}`}`}>
            {BADGE[k]}
          </span>
        ))}
    </>
  );
}

/** Row classes for selected, highlighted, and failed spans. */
export function rowClass(span: Span, p: Pick<TabProps, "selected" | "highlight">): string {
  return [p.selected === span.spanId ? "wl-selected" : "", p.highlight.has(span.spanId) ? "wl-highlight" : "", isErrorSpan(span) ? "wl-row-error" : ""]
    .join(" ")
    .trim();
}

export function ServiceChip({ service, services }: { service: string; services: readonly string[] }) {
  return <span className={`wl-chip wl-svc wl-svc-${serviceSlot(service, services)}`}>{service}</span>;
}
