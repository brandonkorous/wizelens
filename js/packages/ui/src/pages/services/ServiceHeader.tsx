import { ArrowLeft } from "lucide-react";
import { AlertOnThis } from "../../ui/AlertOnThis";
import { groupServices, type ServiceGroup, type ServiceRow } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { useHost } from "../../data/host";
import { useEnvScope, useProjectScope } from "../../data/prefs";
import { inScope } from "../../data/sources";
import { fmtAgo, fmtCount } from "../../format";
import { hrefTo } from "../../routes";
import { KIND_ICON, KIND_LABEL, StatusText } from "./serviceParts";

const DETAIL_LABEL: Partial<Record<ServiceRow["kind"], string>> = { database: "System", external: "Host", queue: "Queue", web: "Source" };

/** The hosts (pods) of a service from the hub or cloud registry, in the chosen scope, one group per environment. Empty elsewhere. */
export function useHostGroups(name: string, owned: boolean): ServiceGroup[] {
  const { registry } = useData();
  const [env] = useEnvScope();
  const [project] = useProjectScope();
  const cloud = useHost().has("accounts");
  if (!owned || !registry) return [];
  return groupServices(registry.services.filter((s) => s.service === name && inScope(s, { env, project }, !cloud)));
}

function statsOf(row: ServiceRow, groups: readonly ServiceGroup[], now: number): [string, string][] {
  const out: [string, string][] = [["Kind", KIND_LABEL[row.kind]]];
  if (row.detail && DETAIL_LABEL[row.kind]) out.push([DETAIL_LABEL[row.kind]!, row.detail]);
  const newest = groups[0]?.newest;
  if (!newest) return out;
  const hosts = groups.reduce((n, g) => n + g.instances.length, 0);
  const online = groups.reduce((n, g) => n + g.online, 0);
  const envs = [...new Set(groups.map((g) => g.environment).filter(Boolean))];
  out.push(["Hosts", `${fmtCount(online)} of ${fmtCount(hosts)} online`]);
  if (envs.length) out.push([envs.length === 1 ? "Environment" : "Environments", envs.join(", ")]);
  if (newest.version) out.push(["Version", newest.version]);
  if (newest.runtime) out.push(["Runtime", newest.runtime]);
  out.push(["Sends with", newest.via === "addon" ? "WizeLens" : "OTLP"], ["Last seen", fmtAgo(newest.lastSeenMs, now)]);
  return out;
}

/** Name, health, and what kind of service it is; for your own services also its hosts, version, and runtime. */
export function ServiceHeader({ row, groups }: { row: ServiceRow; groups: readonly ServiceGroup[] }) {
  const { updatedMs } = useData();
  const Icon = KIND_ICON[row.kind];
  return (
    <section className="wl-panel wl-svc-head">
      <a className="wl-back" href={hrefTo("services")}>
        <ArrowLeft size={14} aria-hidden="true" /> All services
      </a>
      <h1 className="wl-svc-title">
        <Icon size={22} aria-hidden={true} />
        <span className="wl-svc-name">{row.name}</span>
        <span className="wl-svc-status">
          <StatusText status={row.status} />
        </span>
        {(row.kind === "api" || row.kind === "worker") && (
          <span className="wl-dhead-actions">
            <AlertOnThis fields={{ metric: "error_rate", service: row.name, name: `${row.name} errors` }} />
          </span>
        )}
      </h1>
      <dl className="wl-stats">
        {statsOf(row, groups, updatedMs).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
