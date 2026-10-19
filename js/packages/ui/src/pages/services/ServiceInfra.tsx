import { useHost } from "../../data/host";
import { useInfraModel } from "../../data/infra";
import { Panel } from "../../ui/Panel";
import { UsageBar } from "../infra/infraParts";
import { PodsTable } from "../infra/KubeTables";
import { hostHref } from "../infra/links";

/** Where a service runs: its Kubernetes pods, and the hosts that send host metrics. Nothing when neither is known. */
export function ServiceInfra({ name }: { name: string }) {
  const infra = useHost().has("infra");
  const kube = useInfraModel("kubernetes", { service: name }, infra);
  const hosts = useInfraModel("hosts", { q: name }, infra);
  const pods = kube.model?.pods ?? [];
  const mine = (hosts.model?.hosts ?? []).filter((h) => h.services.includes(name));
  return (
    <>
      {pods.length > 0 && (
        <Panel title={`Pods (${pods.length})`} flush>
          <PodsTable rows={pods} />
        </Panel>
      )}
      {mine.length > 0 && (
        <Panel title="Runs On">
          <ul className="wl-svc-edges">
            {mine.map((h) => (
              <li key={h.name}>
                <a href={hostHref(h.name)}>{h.name}</a>
                <span className="wl-row-actions">
                  CPU <UsageBar share={h.cpu} /> Memory <UsageBar share={h.mem} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
