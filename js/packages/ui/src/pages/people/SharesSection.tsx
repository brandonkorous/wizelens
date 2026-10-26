import { useState } from "react";
import { apiSend } from "../../data/api";
import { eachOne, eachText } from "../../data/bulk";
import { act, useApi } from "../../data/useApi";
import { fmtAgo, fmtDate, shortId } from "../../format";
import { traceHref } from "../../routes";
import { useAsk } from "../../ui/Dialog";
import { Empty, Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";
import { SelectionBar, useSelection } from "../../ui/Selection";
import { type Column, Table } from "../../ui/Table";

interface Share {
  id: string;
  traceId: string;
  createdMs: number;
  expiresMs: number;
  views: number;
  /** Under All projects: the link's project and its label. */
  projectId?: string;
  project?: string;
}

/** Shared links that still work: of the selected project, or of every project of the organization under "All projects". */
export function SharesSection({ orgId, project }: { orgId: string; project: { id: string; name: string } | null }) {
  const { data, reload } = useApi<Share[]>(project ? `./api/projects/${project.id}/shares` : `./api/orgs/${orgId}/shares`);
  const { dialog, confirm } = useAsk();
  const shares = data ?? [];
  const { picked, select, clear } = useSelection(shares.map((s) => s.id), "link");
  const [error, setError] = useState<string | null>(null);
  const del = (s: Share) => apiSend("DELETE", `./api/projects/${s.projectId ?? project?.id}/shares/${s.id}`);
  const revokeMany = async () => {
    const chosen = shares.filter((s) => picked.includes(s.id));
    if (!(await confirm({ title: `Revoke ${chosen.length} ${chosen.length === 1 ? "link" : "links"}?`, body: "Anyone who has them can no longer open the traces.", confirmLabel: "Revoke", danger: true }))) return;
    const out = await eachOne(chosen, del);
    clear();
    reload();
    setError(eachText(out, chosen.length, "Revoked", (s) => shortId(s.traceId)));
  };
  const revoke = async (s: Share) =>
    (await confirm({ title: "Revoke this link?", body: "Anyone who has it can no longer open the trace.", confirmLabel: "Revoke link", danger: true })) &&
    void act(() => del(s), reload);
  const columns: Column<Share>[] = [
    { key: "trace", header: "Trace", cell: (s) => <a className="wl-mono" href={traceHref(s.traceId)}>{shortId(s.traceId)}</a> },
    ...(project ? [] : [{ key: "project", header: "Project", cell: (s: Share) => s.project ?? "" }]),
    { key: "made", header: "Shared", cell: (s) => fmtAgo(s.createdMs), className: "wl-nowrap" },
    { key: "ends", header: "Works until", cell: (s) => fmtDate(s.expiresMs), className: "wl-nowrap" },
    { key: "views", header: "Views", num: true, cell: (s) => s.views },
    { key: "x", header: "", className: "wl-cell-actions", cell: (s) => <button type="button" className="wl-link-btn wl-text-error" onClick={() => void revoke(s)}>Revoke</button> },
  ];
  return (
    <>
      <SectionHead title="Shared links" description={`Read-only links to single traces of ${project?.name ?? "every project"}, for people without an account. Make one with Share on a trace.`} />
      <Panel flush>
        <SelectionBar count={picked.length} noun="link" onClear={clear}>
          <button type="button" className="wl-btn wl-btn-danger" onClick={() => void revokeMany()}>Revoke</button>
        </SelectionBar>
        {error && <div className="wl-banner wl-banner-error wl-panel-banner">{error}</div>}
        <Table paging={{ noun: "links", key: "links" }} columns={columns} rows={shares} rowKey={(s) => s.id} select={select} empty={<Empty title="No shared links">Open a trace and use Share to make one.</Empty>} />
      </Panel>
      {dialog}
    </>
  );
}
