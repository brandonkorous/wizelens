import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiFetch } from "../../data/api";
import { useApi } from "../../data/useApi";
import { fmtAgo, fmtDateTime } from "../../format";
import { Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";
import { type Column, Table } from "../../ui/Table";
import { actionText, actorText, type AuditEntry, detailText, GROUP_LABEL, namesOf } from "./auditText";
import { PlanPrompt, useFeature } from "./PlanPrompt";
import type { OrgData } from "./teamTypes";

const PAGE = 100;

/** The action groups ("key.") and actors the log has, for the filter menus. */
function useFacets(orgId: string, names: ReturnType<typeof namesOf>) {
  const { data } = useApi<{ actions: string[]; actors: string[] }>(`./api/orgs/${orgId}/audit/facets`);
  const groups = [...new Set((data?.actions ?? []).map((a) => a.split(".")[0]!))];
  const what: [string, string][] = [["", "Every action"], ...groups.map((g): [string, string] => [`${g}.`, GROUP_LABEL[g] ?? g])];
  const who: [string, string][] = [["", "Anyone"], ...(data?.actors ?? []).map((a): [string, string] => [a, actorText(a, names)])];
  return { what, who };
}

/** Newest first, a page at a time: the first page reloads with the page, older pages add on. */
function useAuditPages(base: string) {
  const first = useApi<AuditEntry[]>(base);
  const [older, setOlder] = useState<AuditEntry[]>([]);
  const [done, setDone] = useState(false);
  useEffect(() => (setOlder([]), setDone(false)), [base]);
  const rows = [...(first.data ?? []), ...older];
  const more = () => {
    const last = rows.at(-1);
    if (!last) return;
    void apiFetch<AuditEntry[]>(`${base}&before=${last.timeMs}`).then((page) => (setOlder((o) => [...o, ...page]), setDone(page.length < PAGE)));
  };
  return { rows, more, done: done || (first.data !== null && first.data.length < PAGE), error: first.error };
}

/** Who did what: members, keys, projects, settings, shares, single sign-on, and every MCP call. Filter, page back, and export. */
export function AuditSection({ orgId, org }: { orgId: string; org: OrgData | null }) {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const names = namesOf(org);
  const facets = useFacets(orgId, names);
  const filter = new URLSearchParams({ ...(action ? { action } : {}), ...(actor ? { actor } : {}) }).toString();
  const { rows, more, done, error } = useAuditPages(`./api/orgs/${orgId}/audit?limit=${PAGE}${filter ? `&${filter}` : ""}`);
  const columns: Column<AuditEntry>[] = [
    { key: "time", header: "When", cell: (a) => <span title={fmtDateTime(a.timeMs)}>{fmtAgo(a.timeMs)}</span>, className: "wl-nowrap" },
    { key: "who", header: "Who", cell: (a) => actorText(a.actor, names), className: "wl-nowrap" },
    { key: "what", header: "What", cell: (a) => <strong>{actionText(a.action)}</strong>, className: "wl-nowrap" },
    { key: "detail", header: "Detail", cell: (a) => <span className="wl-muted">{detailText(a.detail, names)}</span>, className: "wl-wrap" },
  ];
  const gate = useFeature(orgId, "auditExport");
  const exportOf = (format: string) => `./api/orgs/${orgId}/audit/export?format=${format}${filter ? `&${filter}` : ""}`;
  const exportLinks = gate.allowed && (
    <span className="wl-row-actions">
      <a className="wl-btn" href={exportOf("csv")} download><Download aria-hidden="true" /> Export CSV</a>
      <a className="wl-btn" href={exportOf("json")} download><Download aria-hidden="true" /> Export JSON</a>
    </span>
  );
  return (
    <>
      <SectionHead title="Audit log" description="Every change to the organization, its members, projects, keys, settings, links, and plan, and every AI agent call. Newest first. The export follows the filters." action={exportLinks} />
      {gate.loaded && !gate.allowed && <PlanPrompt feature="auditExport" plan={gate.plan} />}
      <section className="wl-panel wl-filters">
        <Select label="What" value={action} options={facets.what} onChange={setAction} />
        <Select label="Who" value={actor} options={facets.who} onChange={setActor} />
      </section>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      <Panel flush>
        <Table columns={columns} rows={rows} rowKey={(a) => `${a.timeMs}:${a.action}:${a.actor}`} empty={<Empty>{filter ? "Nothing matches these filters." : "Nothing yet."}</Empty>} />
        {!done && rows.length > 0 && (
          <div className="wl-panel-more">
            <button type="button" className="wl-btn" onClick={more}>Load older</button>
          </div>
        )}
      </Panel>
    </>
  );
}
