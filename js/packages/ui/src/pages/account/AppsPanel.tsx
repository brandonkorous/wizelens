import { useState } from "react";
import { apiSend } from "../../data/api";
import { act, useApi } from "../../data/useApi";
import { fmtAgo, fmtDate } from "../../format";
import { useAsk } from "../../ui/Dialog";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

/** One connected app (`GET api/me/apps`, `GET api/orgs/{org}/apps`). */
export interface ConnectedApp {
  id: string;
  app: string;
  orgName: string;
  userEmail: string;
  allProjects: boolean;
  projects: { id: string; name: string }[];
  createdMs: number;
  usedMs: number | null;
}

const projectsText = (a: ConnectedApp) => (a.allProjects ? "All projects" : a.projects.map((p) => p.name).join(", ") || "No projects left");

/** Apps such as Claude that read with OAuth. `list` is the API path; `team` adds who connected each one. */
export function AppsPanel({ list, team }: { list: string; team?: boolean }) {
  const { data, error, reload } = useApi<{ apps: ConnectedApp[] }>(list);
  const [failed, setFailed] = useState<string | null>(null);
  const { dialog, confirm } = useAsk();
  const remove = async (a: ConnectedApp) => {
    const ok = await confirm({ title: `Disconnect ${a.app}?`, body: `${a.app} loses access at once. To use it again, connect it again from the app.`, confirmLabel: "Disconnect", danger: true });
    if (ok) setFailed(await act(() => apiSend("DELETE", `${list}/${a.id}`), reload));
  };
  const columns: Column<ConnectedApp>[] = [
    { key: "app", header: "App", cell: (a) => <strong>{a.app}</strong> },
    ...(team ? [{ key: "who", header: "Connected by", cell: (a: ConnectedApp) => a.userEmail }] : [{ key: "org", header: "Organization", cell: (a: ConnectedApp) => a.orgName }]),
    { key: "projects", header: "Can read", cell: projectsText, className: "wl-wrap" },
    { key: "made", header: "Connected", cell: (a) => fmtDate(a.createdMs), className: "wl-nowrap" },
    { key: "used", header: "Last used", cell: (a) => (a.usedMs ? fmtAgo(a.usedMs) : "Never"), className: "wl-nowrap" },
    { key: "x", header: "", className: "wl-cell-actions", cell: (a) => <button type="button" className="wl-link-btn wl-text-error" onClick={() => void remove(a)}>Disconnect</button> },
  ];
  const empty = <Empty title="No connected apps">Add WizeLens to Claude or another MCP client. It asks you to sign in here and pick projects.</Empty>;
  return (
    <Panel flush>
      {(error || failed) && <div className="wl-banner wl-banner-error" role="alert">{error ?? failed}</div>}
      {data && <Table columns={columns} rows={data.apps} rowKey={(a) => a.id} empty={empty} />}
      {dialog}
    </Panel>
  );
}
