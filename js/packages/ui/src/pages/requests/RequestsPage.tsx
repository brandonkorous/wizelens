import { useState } from "react";
import { filterFromQuery, requestOf, type RequestItem } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { useServiceScope } from "../../data/prefs";
import { useRoute } from "../../routes";
import { ModelState } from "../../ui/ModelState";
import { LiveToggle } from "../../ui/LiveToggle";
import { Panel, PageHeader } from "../../ui/Panel";
import { useTrace } from "../trace/useTrace";
import { RequestFilters } from "./RequestFilters";
import { RequestPanel } from "./RequestPanel";
import { RequestsCards } from "./RequestsCards";
import { RequestsTable } from "./RequestsTable";
import "../../styles/pages/requests.css";

function NoSelection() {
  return (
    <Panel className="wl-rq-side wl-rq-hint">
      <p className="wl-muted">This request is no longer stored.</p>
    </Panel>
  );
}

/** The selected request: its row from the model, or built from its trace when it is outside the range. */
function Selected({ id, row }: { id: string; row: RequestItem | null }) {
  const { trace } = useTrace(id);
  const r = row ?? (trace ? requestOf(trace) : null);
  return r ? <RequestPanel key={r.traceId} r={r} trace={trace ?? undefined} /> : <NoSelection />;
}

export function RequestsPage() {
  const route = useRoute();
  const [paused, setPaused] = useState(false);
  const { model, loading, error } = usePageModel("requests", undefined, paused);
  const [service] = useServiceScope();
  const linked = filterFromQuery(route.query);
  const filter = { ...linked, service: linked.service || service };
  const selectedId = route.query.get("trace");
  return (
    <>
      <PageHeader title="Requests" subtitle="Inspect and analyze recent request activity across your stack.">
        <LiveToggle paused={paused} onChange={setPaused} />
      </PageHeader>
      <ModelState model={model} loading={loading} error={error} what="requests" />
      <RequestFilters filter={filter} methods={model?.options.methods ?? []} services={model?.options.services ?? []} />
      {model && <RequestsCards headlines={model.headlines} compareLabel={model.meta.compareLabel} empty={model.total === 0} />}
      {/* The table has the full width until a request is picked; then the details open beside it. */}
      <div className={selectedId ? "wl-grid wl-grid-side" : "wl-grid"}>
        {model && <RequestsTable model={model} selectedId={selectedId} />}
        {selectedId && <Selected id={selectedId} row={model?.selected ?? null} />}
      </div>
    </>
  );
}
