import { filterFromQuery, requestOf, type RequestItem } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { useRoute } from "../../routes";
import { ModelState } from "../../ui/ModelState";
import { Panel, PageHeader } from "../../ui/Panel";
import { useTrace } from "../trace/useTrace";
import { RequestFilters } from "./RequestFilters";
import { RequestPanel } from "./RequestPanel";
import { RequestsCards } from "./RequestsCards";
import { RequestsTable } from "./RequestsTable";
import "../../styles/pages/requests.css";

function NoSelection({ id }: { id: string | null }) {
  return (
    <Panel className="wl-rq-side wl-rq-hint">
      <p className="wl-muted">{id ? "This request is no longer stored." : "Select a request to see its details, headers, response, and trace."}</p>
    </Panel>
  );
}

/** The selected request: its row from the model, or built from its trace when it is outside the range. */
function Selected({ id, row }: { id: string; row: RequestItem | null }) {
  const { trace } = useTrace(id);
  const r = row ?? (trace ? requestOf(trace) : null);
  return r ? <RequestPanel key={r.traceId} r={r} trace={trace ?? undefined} /> : <NoSelection id={id} />;
}

export function RequestsPage() {
  const route = useRoute();
  const { model, loading, error } = usePageModel("requests");
  const filter = filterFromQuery(route.query);
  const selectedId = route.query.get("trace");
  return (
    <>
      <PageHeader title="Requests" subtitle="Inspect and analyze recent request activity across your stack." />
      <ModelState model={model} loading={loading} error={error} what="requests" />
      <RequestFilters filter={filter} methods={model?.options.methods ?? []} services={model?.options.services ?? []} />
      {model && <RequestsCards headlines={model.headlines} compareLabel={model.meta.compareLabel} empty={model.total === 0} />}
      <div className="wl-grid wl-grid-side">
        {model && <RequestsTable model={model} selectedId={selectedId} />}
        {selectedId ? <Selected id={selectedId} row={model?.selected ?? null} /> : <NoSelection id={null} />}
      </div>
    </>
  );
}
