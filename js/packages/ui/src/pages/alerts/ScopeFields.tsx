import { rawService } from "@wizeworks/lens-core/internal";
import { usePageModel } from "../../data/models";
import { Field, FormRow } from "../../ui/Field";
import type { RuleDraft } from "./AlertForm";

const SERVICES_ID = "wl-alert-services";
const ENDPOINTS_ID = "wl-alert-endpoints";

/** Endpoint names of one service, for the endpoint field's suggestions. */
function EndpointOptions({ service }: { service: string }) {
  const { model } = usePageModel("service", { service: `api:${rawService(service)}` });
  return (
    <datalist id={ENDPOINTS_ID}>
      {model?.endpoints.map((e) => <option key={e.name} value={e.name} />)}
    </datalist>
  );
}

/** Which part a trace rule watches: everything, one service, or one endpoint of it. */
export function ScopeFields({ r, set }: { r: RuleDraft; set: <K extends keyof RuleDraft>(k: K) => (v: RuleDraft[K]) => void }) {
  const { model } = usePageModel("services");
  const names = [...new Set((model?.rows ?? []).filter((s) => s.kind === "api" || s.kind === "worker" || s.kind === "web").map((s) => s.name))];
  const perService = r.metric === "slow_queries";
  return (
    <FormRow>
      <Field label="Service (optional)" list={SERVICES_ID} value={r.service} onChange={(e) => set("service")(e.target.value)} placeholder="All services" />
      <Field
        label="Endpoint (optional)"
        list={ENDPOINTS_ID}
        value={r.endpoint}
        disabled={!r.service || perService}
        onChange={(e) => set("endpoint")(e.target.value)}
        placeholder={perService ? "Counted per service" : r.service ? "All endpoints" : "Pick a service first"}
      />
      <datalist id={SERVICES_ID}>
        {names.map((n) => <option key={n} value={n} />)}
      </datalist>
      {r.service && !perService && <EndpointOptions service={r.service} />}
    </FormRow>
  );
}
