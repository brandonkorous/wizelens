import { Check, ChevronDown, Layers, Plus } from "lucide-react";
import { displayService, groupServices, type ServiceGroup } from "@wizeworks/lens-core/internal";
import { type OrgWithProjects, pickOrg } from "../data/account";
import { setProjectScope, useEnvScope, useProjectScope, useServiceScope } from "../data/prefs";
import { ALL_PROJECTS } from "../data/projectScope";
import { useSetService } from "../ui/ServiceSelect";
import { type HubRegistry, inScope, presenceOf } from "../data/sources";
import { fmtAgo, fmtCount } from "../format";
import { Menu } from "./Menu";
import { useNewOrg } from "./NewOrg";

/** The cloud's choices: the shown organization's projects ("All projects" first with more than one), and every organization of the person. */
export interface CloudChoices {
  projects: [string, string][];
  orgs: OrgWithProjects[];
  org: OrgWithProjects | null;
}

interface ChoicesProps {
  title: string;
  /** Value and label. */
  values: [string, string][];
  value: string;
  onPick: (v: string) => void;
  /** Offer "All" first. The cloud brings its own "All projects" choice. */
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

/** The services sending data in the chosen scope; a click filters every page by one. */
function ServiceChoices({ services, close }: { services: ServiceGroup[]; close: () => void }) {
  const [service] = useServiceScope();
  const pick = useSetService();
  return (
    <>
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
      {services.length === 0 && <div className="wl-menu-note">No service has sent data yet. See Connect to add one.</div>}
    </>
  );
}

/** The button's text: the project (or All projects) and environment; the organization too when the person has several. */
function labelOf(cloud: CloudChoices | undefined, project: string, env: string): string {
  if (!cloud) return [project, env].filter(Boolean).join(" · ") || "All projects";
  const name = cloud.projects.find(([id]) => id === project)?.[1] ?? (project === ALL_PROJECTS ? "All projects" : "");
  const org = cloud.orgs.length > 1 ? cloud.org?.name : undefined;
  return [org, name, env].filter(Boolean).join(" · ") || "All projects";
}

/** Filters (organization, project, environment) and the services sending data. */
export function HubMenu({ registry, cloud }: { registry: HubRegistry | null; cloud?: CloudChoices }) {
  const [env, setEnv] = useEnvScope();
  const [project] = useProjectScope();
  const services = groupServices((registry?.services ?? []).filter((s) => inScope(s, { env, project }, !cloud)));
  const online = services.filter((g) => g.online > 0).length;
  const pairs = (list: string[]) => list.map((v): [string, string] => [v, v]);
  const orgs = cloud?.orgs ?? [];
  const newOrg = useNewOrg();
  const label = (
    <>
      <Layers aria-hidden="true" />
      <span className="wl-label">{labelOf(cloud, project, env)}</span>
      <span className="wl-chip-count" title={`${online} of ${services.length} services online`}>
        {online}/{services.length}
      </span>
      <ChevronDown aria-hidden="true" />
    </>
  );
  return (
    <>
      <Menu label={label} title="Organization, project, environment, and connected services" buttonClass="wl-top-btn wl-top-shrink">
        {(close) => (
          <>
            <Choices title="Organization" values={orgs.map((o): [string, string] => [o.id, o.name])} value={cloud?.org?.id ?? ""} all={false} onPick={(v) => (pickOrg(orgs.find((o) => o.id === v)!), close())} />
            {cloud && (
              <button type="button" className="wl-menu-item" onClick={() => (close(), newOrg.start())}>
                <Plus size={14} aria-hidden="true" /> New organization
              </button>
            )}
            <Choices title="Project" values={cloud?.projects ?? pairs(registry?.projects ?? [])} value={project} all={!cloud} onPick={(v) => (setProjectScope(v), close())} />
            <Choices title="Environment" values={pairs(registry?.environments ?? [])} value={env} onPick={(v) => (setEnv(v), close())} />
            <ServiceChoices services={services} close={close} />
          </>
        )}
      </Menu>
      {newOrg.dialog}
    </>
  );
}
