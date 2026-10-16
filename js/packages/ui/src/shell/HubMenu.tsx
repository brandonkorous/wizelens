import { Check, ChevronDown, Layers } from "lucide-react";
import type { HubService } from "@wizeworks/lens-core";
import { useEnvScope, useProjectScope } from "../data/prefs";
import { type HubRegistry, inScope, presenceOf } from "../data/sources";
import { fmtAgo } from "../format";
import { Menu } from "./Menu";

function Choices({ title, values, value, onPick }: { title: string; values: string[]; value: string; onPick: (v: string) => void }) {
  if (values.length === 0) return null;
  return (
    <>
      <div className="wl-menu-head">{title}</div>
      {["", ...values].map((v) => (
        <button key={v || "all"} type="button" className={`wl-menu-item${v === value ? " wl-active" : ""}`} onClick={() => onPick(v)}>
          <span className="wl-truncate">{v || `All ${title.toLowerCase()}s`}</span>
          {v === value && <Check size={14} aria-hidden="true" className="wl-menu-check" />}
        </button>
      ))}
    </>
  );
}

function ServiceLine({ s }: { s: HubService }) {
  const where = [s.project, s.environment, s.host].filter(Boolean).join(" · ");
  return (
    <div className="wl-menu-item wl-menu-static">
      <span className={`wl-env-dot${s.online ? "" : " wl-off"}`} title={presenceOf(s)} />
      <span className="wl-truncate">
        <strong>{s.service}</strong>
        <span className="wl-muted wl-small"> · {s.online ? (s.runtime ?? s.via) : `seen ${fmtAgo(s.lastSeenMs)}`}</span>
        {where && <span className="wl-muted wl-small wl-block">{where}</span>}
      </span>
    </div>
  );
}

/** Hub filters (environment and project) and the services the hub hears from. */
export function HubMenu({ registry }: { registry: HubRegistry | null }) {
  const [env, setEnv] = useEnvScope();
  const [project, setProject] = useProjectScope();
  const services = (registry?.services ?? []).filter((s) => inScope(s, { env, project }));
  const online = services.filter((s) => s.online).length;
  const text = [project, env].filter(Boolean).join(" · ") || "All services";
  const label = (
    <>
      <Layers aria-hidden="true" />
      <span className="wl-label">{text}</span>
      <span className="wl-chip-count" title={`${online} of ${services.length} services online`}>
        {online}/{services.length}
      </span>
      <ChevronDown aria-hidden="true" />
    </>
  );
  return (
    <Menu label={label} title="Project, environment, and connected services">
      {(close) => (
        <>
          <Choices title="Project" values={registry?.projects ?? []} value={project} onPick={(v) => (setProject(v), close())} />
          <Choices title="Environment" values={registry?.environments ?? []} value={env} onPick={(v) => (setEnv(v), close())} />
          <div className="wl-menu-head">Services</div>
          {services.map((s) => (
            <ServiceLine key={`${s.project}|${s.service}|${s.environment}|${s.host}`} s={s} />
          ))}
          {services.length === 0 && <div className="wl-menu-note">No service has sent data yet. See Settings to connect one.</div>}
        </>
      )}
    </Menu>
  );
}
