import { useMemo } from "react";
import { fmtCount } from "../../format";
import { type MetricsState, useMetricsModel } from "../../data/metrics";
import { useRoute } from "../../routes";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { MetricChart } from "./MetricChart";
import { MetricList, RuntimeStrip } from "./MetricParts";
import "../../styles/pages/metrics.css";

function Banners({ state }: { state: MetricsState }) {
  const sampled = state.model?.meta.sampled;
  return (
    <>
      {state.loading && <div className="wl-banner wl-banner-info">Loading metrics…</div>}
      {state.error && <div className="wl-banner wl-banner-error">Could not load metrics: {state.error}</div>}
      {sampled && (
        <div className="wl-banner wl-banner-info">
          Based on the newest {fmtCount(sampled.used)} of {fmtCount(sampled.total)} points in this range. Pick a shorter range for exact numbers.
        </div>
      )}
      {state.clipped && <div className="wl-banner wl-banner-info">This app keeps metrics for one hour, so this page shows the last hour. Send them to a hub or the cloud for longer history.</div>}
    </>
  );
}

function NoMetrics() {
  return (
    <Panel>
      <Empty title="This host does not keep metrics">
        Update the WizeLens add-on, or send OpenTelemetry metrics to a WizeLens hub or the cloud at <code>/v1/metrics</code>.
      </Empty>
    </Panel>
  );
}

export function MetricsPage() {
  const state = useMetricsModel();
  const { query } = useRoute();
  const key = query.toString();
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(key)), [key]);
  const model = state.model;
  return (
    <div className="wl-metrics-page">
      <PageHeader title="Metrics" subtitle="CPU, memory, garbage collection, request times, and your own counters, per service." />
      <Banners state={state} />
      {state.source === "none" && <NoMetrics />}
      {model && (
        <>
          <RuntimeStrip model={model} selected={params.metric ?? ""} />
          <div className="wl-metric-body">
            <MetricList model={model} params={params} />
            <MetricChart detail={model.selected} />
          </div>
        </>
      )}
    </div>
  );
}
