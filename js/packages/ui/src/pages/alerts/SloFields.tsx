import { useApi } from "../../data/useApi";
import { Select } from "../../ui/Controls";
import { FormRow } from "../../ui/Field";
import { type SlosData, useSlosApi } from "../slos/sloTypes";
import type { RuleDraft } from "./AlertForm";

/** The SLO a burn-rate rule watches. The threshold is a burn rate: 1 spends the budget exactly over the SLO's window. */
export function SloFields({ r, set }: { r: RuleDraft; set: <K extends keyof RuleDraft>(k: K) => (v: RuleDraft[K]) => void }) {
  const api = useSlosApi();
  const { data } = useApi<SlosData>(api.ready ? api.url() : null);
  const options: [string, string][] = [["", "Pick an SLO…"], ...(data?.slos ?? []).map((s): [string, string] => [s.slo.id, s.slo.name])];
  return (
    <>
      <FormRow>
        <Select label="SLO" value={r.sloId} options={options} onChange={set("sloId")} />
      </FormRow>
      <p className="wl-muted wl-small">A burn rate of 1 spends the error budget exactly over the SLO's window. 14.4 over 1 hour spends 2% of a 30-day budget: a page. 6 over 6 hours is a ticket.</p>
    </>
  );
}
