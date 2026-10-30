import { useState } from "react";
import { Download } from "lucide-react";
import { PAGE_SIZES, type PageInfo, pageParams } from "@wizeworks/lens-core/internal";
import { useApi } from "../../data/useApi";
import { fmtAgo, fmtDateTime } from "../../format";
import { setQuery, useRoute } from "../../routes";
import { Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";
import { type Column, Table } from "../../ui/Table";
import { actionText, actorText, type AuditEntry, detailText, GROUP_LABEL, namesOf } from "./auditText";
import { PlanPrompt, useFeature } from "../organization/PlanPrompt";
import type { OrgData } from "../organization/orgTypes";

/** The action groups ("key.") and actors the log has, for the filter menus. */
function useFacets(orgId: string, names: ReturnType<typeof namesOf>) {
  const { data } = useApi<{ actions: string[]; actors: string[] }>(`./api/orgs/${orgId}/audit/facets`);
  const groups = [...new Set((data?.actions ?? []).map((a) => a.split(".")[0]!))];
  const what: [string, string][] = [["", "Every action"], ...groups.map((g): [string, string] => [`${g}.`, GROUP_LABEL[g] ?? g])];
  const who: [string, string][] = [["", "Anyone"], ...(data?.actors ?? []).map((a): [string, string] => [a, actorText(a, names)])];
  return { what, who };
}

/** Newest first, one page at a time (auditpage, auditsize in the URL), and how many lines match. */
function useAuditPage(orgId: string, filter: string) {
  const { query } = useRoute();
  const { page, size } = pageParams(Object.fromEntries(query), PAGE_SIZES[0]!, "audit");
  const and = filter ? `&${filter}` : "";
  const list = useApi<AuditEntry[]>(`./api/orgs/${orgId}/audit?limit=${size}&offset=${(page - 1) * size}${and}`);
  const count = useApi<{ total: number }>(`./api/orgs/${orgId}/audit/count${filter ? `?${filter}` : ""}`);
  const info: PageInfo = { key: "audit", total: count.data?.total ?? 0, page, size, sort: null };
  return { rows: list.data ?? [], info, error: list.error ?? count.error };
}

/** Who did what: members, keys, projects, settings, shares, single sign-on, and every MCP call. Filter, page back, and export. */
export function AuditSection({ orgId, org }: { orgId: string; org: OrgData | null }) {
  const [action, setActionText] = useState("");
  const [actor, setActorText] = useState("");
  const setAction = (v: string) => (setActionText(v), setQuery({ auditpage: null }));
  const setActor = (v: string) => (setActorText(v), setQuery({ auditpage: null }));
  const filter = new URLSearchParams({ ...(action ? { action } : {}), ...(actor ? { actor } : {}) }).toString();
  const { rows, info, error } = useAuditPage(orgId, filter);
  const names = namesOf(org, rows);
  const facets = useFacets(orgId, names);
  const columns: Column<AuditEntry>[] = [
    { key: "time", header: "When", cell: (a) => <>{fmtDateTime(a.timeMs)}<br /><span className="wl-muted wl-small">{fmtAgo(a.timeMs)}</span></>, className: "wl-nowrap" },
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
        <Table columns={columns} rows={rows} served={{ info, noun: "lines" }} rowKey={(a) => `${a.timeMs}:${a.action}:${a.actor}`} empty={<Empty>{filter ? "Nothing matches these filters." : "Nothing yet."}</Empty>} />
      </Panel>
    </>
  );
}
