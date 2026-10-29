import { useState } from "react";
import { Link2 } from "lucide-react";
import { currentProject, useAccount } from "../data/account";
import { apiSend } from "../data/api";
import { useHost, useRange } from "../data/host";
import { getPeriod, periodParams } from "../data/period";
import { getScope } from "../data/prefs";
import { decodeParam, type Route, useRoute } from "../routes";
import { CopyButton } from "../ui/Badges";
import { Select } from "../ui/Controls";
import { Field } from "../ui/Field";
import { fmtDate } from "../format";
import { Menu } from "./Menu";
import { isAllProjects } from "../data/projectScope";

const DAYS: [string, string][] = [["1", "For 1 day"], ["7", "For 7 days"], ["30", "For 30 days"]];
const LISTS = new Set(["overview", "requests", "errors", "database", "logs", "insights", "security", "rendering", "services", "traces"]);

/** The page model behind a route, and the parameters that pick its item (an error group, a service, an endpoint, a query, a route). */
export function sharedPageOf(r: Route): { page: string; params: Record<string, string> } | null {
  const [a, b, c] = r.params.map(decodeParam);
  if (r.page === "errors" && a) return { page: "error", params: { group: a } };
  if (r.page === "services" && a && b === "endpoints" && c) return { page: "endpoint", params: { service: a, endpoint: c } };
  if (r.page === "services" && a) return { page: "service", params: { service: a } };
  if (r.page === "database" && a === "queries" && b) return { page: "query", params: { q: b } };
  if (r.page === "rendering" && a === "routes" && b) return { page: "route", params: { route: b } };
  return LISTS.has(r.page) && !a ? { page: r.page, params: {} } : null;
}

function ShareForm({ target }: { target: { page: string; params: Record<string, string> } }) {
  const route = useRoute();
  const [range] = useRange();
  const [days, setDays] = useState("7");
  const [made, setMade] = useState<{ url: string; expiresMs: number } | null>(null);
  const [forWhom, setForWhom] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // The link's header names the project, so the person it is sent to knows whose numbers these are.
  const title = currentProject(useAccount())?.project?.name ?? "WizeLens";
  const make = () => {
    const { window, compare } = getPeriod();
    const scope = getScope();
    const params = { ...Object.fromEntries(route.query), ...periodParams(window, compare), ...(scope.service ? { service: scope.service } : {}), ...target.params };
    const body = { page: target.page, range, params, env: scope.env, title, days: Number(days), note: forWhom };
    void apiSend<{ url: string; expiresMs: number }>("POST", `./api/projects/${encodeURIComponent(scope.project)}/shares`, body).then(
      setMade,
      (e: unknown) => setNote(e instanceof Error ? e.message : String(e)),
    );
  };
  return (
    <div className="wl-save-view">
      <p className="wl-muted wl-small">A read-only link to this page as it is now: its numbers are kept and do not change. Anyone with the link can open it.</p>
      <Select label="How long" value={days} options={DAYS} onChange={setDays} />
      <Field label="Who is it for?" hint={"A name, a client, or a ticket. Only your team sees it, in Shared links."} value={forWhom} maxLength={120} onChange={(e) => setForWhom(e.target.value)} />
      {made ? <span className="wl-share-url"><code className="wl-truncate">{made.url}</code><CopyButton text={made.url} label="Copy link" /></span> : <button type="button" className="wl-btn wl-btn-primary" onClick={make}>Make a link</button>}
      {made && <span className="wl-muted wl-small">Works until {fmtDate(made.expiresMs)}. Revoke it under People & access, Shared links.</span>}
      {note && <p className="wl-text-error wl-small">{note}</p>}
    </div>
  );
}

/** Share the page you are on by link (cloud): list pages and the pages of one error, service, endpoint, query, or route. */
export function SharePage() {
  const route = useRoute();
  const host = useHost();
  const target = sharedPageOf(route);
  // A link belongs to one project: none under "All projects".
  if (!host.has("sharing") || !getScope().project || isAllProjects() || !target) return null;
  return <Menu label={<Link2 size={18} aria-hidden="true" />} title="Share this page">{() => <ShareForm target={target} />}</Menu>;
}
