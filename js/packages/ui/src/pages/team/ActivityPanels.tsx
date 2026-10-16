import { apiSend } from "../../data/api";
import { act, useApi } from "../../data/useApi";
import { fmtAgo, fmtDate, shortId } from "../../format";
import { traceHref } from "../../routes";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

interface Share {
  id: string;
  traceId: string;
  createdMs: number;
  expiresMs: number;
  views: number;
}

interface AuditEntry {
  actor: string;
  action: string;
  detail: Record<string, unknown>;
  timeMs: number;
}

/** Shared links of the selected project that still work. */
export function SharesPanel({ projectId }: { projectId: string }) {
  const { data, reload } = useApi<Share[]>(`./api/projects/${projectId}/shares`);
  const revoke = (s: Share) => void act(() => apiSend("DELETE", `./api/projects/${projectId}/shares/${s.id}`), reload);
  const columns: Column<Share>[] = [
    { key: "trace", header: "Trace", cell: (s) => <a className="wl-mono" href={traceHref(s.traceId)}>{shortId(s.traceId)}</a> },
    { key: "made", header: "Shared", cell: (s) => fmtAgo(s.createdMs) },
    { key: "ends", header: "Works until", cell: (s) => fmtDate(s.expiresMs) },
    { key: "views", header: "Views", num: true, cell: (s) => s.views },
    { key: "x", header: "", cell: (s) => <button type="button" className="wl-link-btn wl-text-error" onClick={() => revoke(s)}>Revoke</button> },
  ];
  return (
    <Panel title="Shared links" flush>
      <Table columns={columns} rows={data ?? []} rowKey={(s) => s.id} empty={<Empty>No shared links. Use Share on a trace to make one.</Empty>} />
    </Panel>
  );
}

const detailText = (d: Record<string, unknown>) =>
  Object.entries(d)
    .filter(([k]) => k !== "line")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ") || String(d.line ?? "");

/** Who did what: members, keys, projects, shares, and every MCP call. */
export function AuditPanel({ orgId }: { orgId: string }) {
  const { data } = useApi<AuditEntry[]>(`./api/orgs/${orgId}/audit`);
  const columns: Column<AuditEntry>[] = [
    { key: "time", header: "When", cell: (a) => fmtAgo(a.timeMs), className: "wl-nowrap" },
    { key: "who", header: "Who", cell: (a) => <code className="wl-mono wl-small">{a.actor.slice(0, 13)}</code> },
    { key: "what", header: "Action", cell: (a) => <strong>{a.action}</strong> },
    { key: "detail", header: "Detail", cell: (a) => <span className="wl-muted wl-small">{detailText(a.detail)}</span>, className: "wl-wrap" },
  ];
  return (
    <Panel title="Audit log" flush>
      <Table columns={columns} rows={data ?? []} rowKey={(a) => `${a.timeMs}:${a.action}:${a.actor}`} empty={<Empty>Nothing yet.</Empty>} />
    </Panel>
  );
}
