import { useState } from "react";
import type { Project } from "../../data/account";
import { apiSend } from "../../data/api";
import { act } from "../../data/useApi";
import { Select } from "../../ui/Controls";
import { Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { type Member, type OrgData, type ProjectRole, ROLE_LABEL } from "./teamTypes";

type Choice = ProjectRole | "";

const CHOICES = (m: Member): [Choice, string][] => [
  ["", `Organization role (${ROLE_LABEL[m.role]})`],
  ["none", "No access"],
  ["viewer", "Viewer"],
  ["member", "Member"],
  ["admin", "Admin of this project"],
];

const overridable = (m: Member) => m.role === "member" || m.role === "viewer";

/** Who may see one project, and what they may do there. Owners and admins always keep their organization role. */
export function ProjectAccess({ orgId, project, data, reload, onClose }: { orgId: string; project: Project; data: OrgData; reload: () => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const own = new Map(data.projectRoles.filter((r) => r.projectId === project.id).map((r) => [r.userId, r.role]));
  const change = (m: Member, role: Choice) => void act(() => apiSend("PUT", `./api/orgs/${orgId}/projects/${project.id}/roles/${m.userId}`, { role: role || null }), reload).then(setError);
  const columns: Column<Member>[] = [
    { key: "who", header: "Person", cell: (m) => <span className="wl-who"><strong>{m.name}</strong><small>{m.email}</small></span> },
    {
      key: "role",
      header: "On this project",
      cell: (m) =>
        overridable(m) ? (
          <Select small label={`${m.name} on ${project.name}`} value={(own.get(m.userId) ?? "") as Choice} options={CHOICES(m)} onChange={(r) => change(m, r)} />
        ) : (
          <span className="wl-muted">Always {ROLE_LABEL[m.role].toLowerCase()}</span>
        ),
    },
  ];
  return (
    <Panel title={`Access to ${project.name}`} className="wl-panel-form" action={<button type="button" className="wl-link-btn" onClick={onClose}>Done</button>}>
      <p className="wl-muted wl-settings-note">Give a member or viewer more, less, or no access to this project. No access hides it from them, in the dashboard, links, and AI agents.</p>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      <Table columns={columns} rows={data.members} rowKey={(m) => m.userId} />
    </Panel>
  );
}
