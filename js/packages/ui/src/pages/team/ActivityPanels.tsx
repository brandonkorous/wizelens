import { apiSend } from "../../data/api";
import { act, useApi } from "../../data/useApi";
import { fmtAgo, fmtDate, fmtDateTime, shortId } from "../../format";
import { traceHref } from "../../routes";
import { useAsk } from "../../ui/Dialog";
import { Empty, Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";
import { type Column, Table } from "../../ui/Table";
import { actionText, actorText, type AuditEntry, detailText, namesOf } from "./auditText";
import { PlanPrompt, useFeature } from "./PlanPrompt";
import type { OrgData } from "./teamTypes";

interface Share {
  id: string;
  traceId: string;
  createdMs: number;
  expiresMs: number;
  views: number;
}

/** Shared links of the selected project that still work. */
export function SharesSection({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { data, reload } = useApi<Share[]>(`./api/projects/${projectId}/shares`);
  const { dialog, confirm } = useAsk();
  const revoke = async (s: Share) =>
    (await confirm({ title: "Revoke this link?", body: "Anyone who has it can no longer open the trace.", confirmLabel: "Revoke link", danger: true })) &&
    void act(() => apiSend("DELETE", `./api/projects/${projectId}/shares/${s.id}`), reload);
  const columns: Column<Share>[] = [
    { key: "trace", header: "Trace", cell: (s) => <a className="wl-mono" href={traceHref(s.traceId)}>{shortId(s.traceId)}</a> },
    { key: "made", header: "Shared", cell: (s) => fmtAgo(s.createdMs), className: "wl-nowrap" },
    { key: "ends", header: "Works until", cell: (s) => fmtDate(s.expiresMs), className: "wl-nowrap" },
    { key: "views", header: "Views", num: true, cell: (s) => s.views },
    { key: "x", header: "", className: "wl-cell-actions", cell: (s) => <button type="button" className="wl-link-btn wl-text-error" onClick={() => void revoke(s)}>Revoke</button> },
  ];
  return (
    <>
      <SectionHead title="Shared links" description={`Read-only links to single traces of ${projectName}, for people without an account. Make one with Share on a trace.`} />
      <Panel flush>
        <Table columns={columns} rows={data ?? []} rowKey={(s) => s.id} empty={<Empty title="No shared links">Open a trace and use Share to make one.</Empty>} />
      </Panel>
      {dialog}
    </>
  );
}

/** Who did what: members, keys, projects, shares, single sign-on, and every MCP call. */
export function AuditSection({ orgId, org }: { orgId: string; org: OrgData | null }) {
  const { data } = useApi<AuditEntry[]>(`./api/orgs/${orgId}/audit`);
  const names = namesOf(org);
  const gate = useFeature(orgId, "auditExport");
  const exportLinks = gate.allowed && (
    <span className="wl-row-actions">
      <a className="wl-btn" href={`./api/orgs/${orgId}/audit/export?format=csv`} download>Export CSV</a>
      <a className="wl-btn" href={`./api/orgs/${orgId}/audit/export?format=json`} download>Export JSON</a>
    </span>
  );
  const columns: Column<AuditEntry>[] = [
    { key: "time", header: "When", cell: (a) => <span title={fmtDateTime(a.timeMs)}>{fmtAgo(a.timeMs)}</span>, className: "wl-nowrap" },
    { key: "who", header: "Who", cell: (a) => actorText(a.actor, names), className: "wl-nowrap" },
    { key: "what", header: "What", cell: (a) => <strong>{actionText(a.action)}</strong>, className: "wl-nowrap" },
    { key: "detail", header: "Detail", cell: (a) => <span className="wl-muted">{detailText(a.detail, names)}</span>, className: "wl-wrap" },
  ];
  return (
    <>
      <SectionHead title="Audit log" description="Every change to the organization, its members, projects, keys, links, and plan, and every AI agent call. Newest first." action={exportLinks} />
      {gate.loaded && !gate.allowed && <PlanPrompt feature="auditExport" plan={gate.plan} />}
      <Panel flush>
        <Table columns={columns} rows={data ?? []} rowKey={(a) => `${a.timeMs}:${a.action}:${a.actor}`} empty={<Empty>Nothing yet.</Empty>} />
      </Panel>
    </>
  );
}
