import { QueryFold } from "./QueryFold";

const KINDS = [
  { label: "N+1 queries", color: "var(--wl-orange)" },
  { label: "N+1 HTTP calls", color: "var(--wl-orange)" },
  { label: "Duplicate queries", color: "var(--wl-amber)" },
  { label: "Slow queries", color: "var(--wl-amber)" },
  { label: "Database waits", color: "var(--wl-amber)" },
  { label: "Errors", color: "var(--wl-red)" },
  { label: "Render hot spots", color: "var(--wl-blue)" },
];

export function Insight() {
  return (
    <section className="wl-section wl-paper" id="insights">
      <div className="wl-wrap wl-insight">
        <div className="wl-insight-copy">
          <h2 className="wl-h2">Eight queries. One would do.</h2>
          <p className="wl-lede">
            You did not ask WizeLens to look for this. It looks at every trace for the mistakes that slow real apps
            down, ranks them, and tells you how to fix them.
          </p>
          <ul className="wl-kinds">
            {KINDS.map((k) => (
              <li key={k.label}><span className="wl-dot" style={{ background: k.color }} />{k.label}</li>
            ))}
          </ul>
          <p className="wl-insight-problems">
            <b>Problems.</b> WizeLens also compares every service and endpoint with the same hour in the 4 weeks before.
            When error rate, p95, or traffic is above normal, it says so and names the likely cause: a new release, a new
            error, a slower query, or a service further down the calls. Plain statistics, no AI.
          </p>
          <p className="wl-insight-note">The same rules run in .NET, in Node, and on the hub and the cloud for Java, Python, and Go, so every service gives the same answer.</p>
        </div>
        <QueryFold />
      </div>
    </section>
  );
}
