import { Check, ChevronDown, Layers } from "lucide-react";
import { displayService, groupServices, type ServiceGroup } from "@wizeworks/lens-core";
import { useEnvScope, useProjectScope, useServiceScope } from "../data/prefs";
import { useSetService } from "../ui/ServiceSelect";
import { type HubRegistry, inScope, presenceOf } from "../data/sources";
import { fmtAgo, fmtCount } from "../format";
import { Menu } from "./Menu";

interface ChoicesProps {
  title: string;
  /** Value and label. */
  values: [string, string][];
  value: string;
  onPick: (v: string) => void;
  /** Offer "All" first. The cloud always shows one project, so it has no "All". */
  all?: boolean;
}

function Choices({ title, values, value, onPick, all = true }: ChoicesProps) {
  if (values.length === 0) return null;
  const list: [string, string][] = all ? [["", `All ${title.toLowerCase()}s`], ...values] : values;
  return (
    <>
      <div className="wl-menu-head">{title}</div>
      {list.map(([v, text]) => (
        <button key={v || "all"} type="button" className={`wl-menu-item${v === value ? " wl-active" : ""}`} onClick={() => onPick(v)}>
          <span className="wl-truncate">{text}</span>
          {v === value && <Check size={14} aria-hidden="true" className="wl-menu-check" />}
        </button>
      ))}
    </>
  );
}

/** One service, however many hosts (pods) send for it. A click filters every page by it. */
function ServiceLine({ g, active, onPick }: { g: ServiceGroup; active: boolean; onPick: () => void }) {
  const s = g.newest;
  const hosts = g.instances.length > 1 ? `${fmtCount(g.online)} of ${fmtCount(g.instances.length)} hosts online` : s.host;
  const where = [s.project, s.environment, hosts].filter(Boolean).join(" · ");
  const online = g.online > 0;
  return (
    <button type="button" className={`wl-menu-item${active ? " wl-active" : ""}`} onClick={onPick}>
      <span className={`wl-env-dot${online ? "" : " wl-off"}`} title={online ? "Online" : presenceOf(s)} />
      <span className="wl-truncate">
        <strong>{s.service}</strong>
        <span className="wl-muted wl-small"> · {online ? (s.runtime ?? s.via) : `seen ${fmtAgo(s.lastSeenMs)}`}</span>
        {where && <span className="wl-muted wl-small wl-block">{where}</span>}
      </span>
      {active && <Check size={14} aria-hidden="true" className="wl-menu-check" />}
    </button>
  );
}

/** Hub filters (environment and project) and the services the hub hears from. */
export function HubMenu({ registry, projects }: { registry: HubRegistry | null; projects?: [string, string][] }) {
  const [env, setEnv] = useEnvScope();
  const [project, setProject] = useProjectScope();
  const [service] = useServiceScope();
  const pick = useSetService();
  const services = groupServices((registry?.services ?? []).filter((s) => inScope(s, { env, project }, !projects)));
  const online = services.filter((g) => g.online > 0).length;
  const projectName = projects ? projects.find(([id]) => id === project)?.[1] : project;
  const text = [projectName, env].filter(Boolean).join(" · ") || "All projects";
  const pairs = (list: string[]) => list.map((v): [string, string] => [v, v]);
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
          <Choices title="Project" values={projects ?? pairs(registry?.projects ?? [])} value={project} all={!projects} onPick={(v) => (setProject(v), close())} />
          <Choices title="Environment" values={pairs(registry?.environments ?? [])} value={env} onPick={(v) => (setEnv(v), close())} />
          <div className="wl-menu-head">Services</div>
          {services.length > 0 && (
            <button type="button" className={`wl-menu-item${service ? "" : " wl-active"}`} onClick={() => (pick(""), close())}>
              <span className="wl-truncate">All services</span>
              {!service && <Check size={14} aria-hidden="true" className="wl-menu-check" />}
            </button>
          )}
          {services.map((g) => (
            <ServiceLine key={g.key} g={g} active={displayService(g.service) === service} onPick={() => (pick(displayService(g.service)), close())} />
          ))}
          {services.length === 0 && <div className="wl-menu-note">No service has sent data yet. See Settings to connect one.</div>}
        </>
      )}
    </Menu>
  );
}
