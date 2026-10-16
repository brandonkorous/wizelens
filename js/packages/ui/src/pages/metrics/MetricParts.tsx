import { fmtMetric, type MetricArea, type MetricInfo, type MetricsModel } from "@wizeworks/lens-core";
import { setQuery } from "../../routes";
import { SearchInput, Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { Sparkline } from "../../ui/Sparkline";

export const LINE_COLORS = ["var(--wl-blue)", "var(--wl-green)", "var(--wl-orange)", "var(--wl-red)", "var(--wl-k-db)", "var(--wl-k-messaging)", "var(--wl-k-render)", "var(--wl-amber)", "var(--wl-k-browser)", "var(--wl-slate)"];

const AREA_LABEL: Record<MetricArea, string> = { runtime: "Runtime", http: "HTTP", database: "Database", messaging: "Messaging", rpc: "RPC", custom: "Your metrics" };

/** CPU, memory, heap, and more per service, from the well-known runtime metrics. */
export function RuntimeStrip({ model, selected }: { model: MetricsModel; selected: string }) {
  if (model.runtime.length === 0) return null;
  return (
    <div className="wl-metric-runtime">
      {model.runtime.map(({ service, stats }) => (
        <section key={service} className="wl-panel wl-metric-service">
          <h2>{service}</h2>
          <div className="wl-metric-tiles">
            {stats.map((s) => (
              <button key={s.key} type="button" className={`wl-metric-tile${selected === s.metric ? " wl-active" : ""}`} onClick={() => setQuery({ metric: s.metric, service, group: null })} title={s.metric}>
                <span>{s.label}</span>
                <strong>{s.lastText}</strong>
                <Sparkline values={s.spark} width={96} height={24} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MetricRow({ m, active }: { m: MetricInfo; active: boolean }) {
  return (
    <li>
      <button type="button" className={active ? "wl-active" : undefined} onClick={() => setQuery({ metric: m.name, group: null, stat: null })} title={m.description || m.name}>
        <span className="wl-metric-name">
          <strong>{m.name}</strong>
          <em>
            {m.services.join(", ")} · {m.series} series
          </em>
        </span>
        <span className="wl-metric-last">{m.lastText}</span>
        <Sparkline values={m.spark} width={72} height={22} />
      </button>
    </li>
  );
}

/** Every metric in the range, grouped by area, with search and a service filter. */
export function MetricList({ model, params }: { model: MetricsModel; params: Record<string, string> }) {
  const areas = [...new Set(model.catalog.map((m) => m.area))];
  const services: [string, string][] = [["", "All services"], ...model.services.map((s): [string, string] => [s, s])];
  return (
    <Panel title={`Metrics (${model.catalog.length})`} className="wl-metric-list">
      <div className="wl-metric-filters">
        <SearchInput value={params.q ?? ""} onChange={(q) => setQuery({ q: q || null })} placeholder="Find a metric" />
        {model.services.length > 1 && <Select value={params.service ?? ""} options={services} onChange={(s) => setQuery({ service: s || null })} label="Service" small />}
      </div>
      {model.catalog.length === 0 && <Empty title="No metrics in this range">Pick a wider range, or check that your services send metrics.</Empty>}
      {areas.map((area) => (
        <div key={area}>
          <h3 className="wl-metric-area">{AREA_LABEL[area]}</h3>
          <ul>
            {model.catalog
              .filter((m) => m.area === area)
              .map((m) => (
                <MetricRow key={m.name} m={m} active={params.metric === m.name} />
              ))}
          </ul>
        </div>
      ))}
    </Panel>
  );
}

/** "12.3 ms" in the metric's drawn unit. */
export const formatterOf = (unit: string) => (v: number) => fmtMetric(v, unit);
