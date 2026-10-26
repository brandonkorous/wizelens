import { useState } from "react";
import type { Project } from "../../data/account";
import { Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";
import { type Column, Table } from "../../ui/Table";
import { ROLE_LABEL } from "../organization/orgTypes";
import type { OrgCtx } from "../organization/useOrg";
import { ProjectAccess } from "./ProjectAccess";

/** Who has a role of their own on a project, as names: "Kai (viewer), Lee (no access)". */
function ownRoles(ctx: OrgCtx, p: Project): string {
  const names = new Map(ctx.data.members.map((m) => [m.userId, m.name]));
  const rows = ctx.data.projectRoles.filter((r) => r.projectId === p.id);
  return rows.map((r) => `${names.get(r.userId) ?? "Someone"} (${r.role === "none" ? "no access" : ROLE_LABEL[r.role].toLowerCase()})`).join(", ");
}

/** Each project, and who sees it differently from their organization role. One project's access opens below. */
export function AccessSection({ ctx }: { ctx: OrgCtx }) {
  const [open, setOpen] = useState<Project | null>(null);
  const { org, data, reload } = ctx;
  const columns: Column<Project>[] = [
    { key: "name", header: "Project", cell: (p) => <strong>{p.name}</strong> },
    { key: "own", header: "Own roles", className: "wl-wrap", cell: (p) => ownRoles(ctx, p) || <span className="wl-muted">Everyone has their organization role</span> },
    { key: "x", header: "", className: "wl-cell-actions", cell: (p) => <button type="button" className="wl-link-btn" onClick={() => setOpen(p)}>Change access</button> },
  ];
  return (
    <>
      <SectionHead title="Project access" description="Everyone sees every project with their organization role. Give a member or viewer more, less, or no access to one project here." />
      {open && <ProjectAccess key={open.id} orgId={org.id} project={open} data={data} reload={reload} onClose={() => setOpen(null)} />}
      <Panel flush>
        <Table paging={{ noun: "projects", key: "access" }} columns={columns} rows={data.projects} rowKey={(p) => p.id} />
      </Panel>
    </>
  );
}
