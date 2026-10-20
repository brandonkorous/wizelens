import { apiSend } from "../../data/api";
import { act, useApi } from "../../data/useApi";
import { fmtAgo, fmtDate, shortId } from "../../format";
import { traceHref } from "../../routes";
import { useAsk } from "../../ui/Dialog";
import { Empty, Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";
import { type Column, Table } from "../../ui/Table";

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
