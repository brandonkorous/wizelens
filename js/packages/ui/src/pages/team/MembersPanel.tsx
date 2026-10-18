import { useState } from "react";
import { auth, loadAccount, type Role } from "../../data/account";
import { act } from "../../data/useApi";
import { fmtDate } from "../../format";
import { Select } from "../../ui/Controls";
import { Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { canManage, type Member, type OrgData, ROLE_OPTIONS } from "./teamTypes";

interface Ctx {
  orgId: string;
  me: string;
  manage: boolean;
  /** True when this person is the only owner: they cannot leave. */
  onlyOwner: boolean;
  run: (fn: () => Promise<unknown>) => void;
}

function columns({ orgId, me, manage, onlyOwner, run }: Ctx): Column<Member>[] {
  const change = (m: Member, role: Role) =>
    run(async () => {
      await auth((c) => c.organization.updateMemberRole({ memberId: m.memberId, role, organizationId: orgId }));
      if (m.userId === me) await loadAccount();
    });
  const remove = (m: Member) => window.confirm(`Remove ${m.name} from the organization?`) && run(() => auth((c) => c.organization.removeMember({ memberIdOrEmail: m.memberId, organizationId: orgId })));
  const leave = () => window.confirm("Leave this organization? You lose access to its data.") && run(async () => (await auth((c) => c.organization.leave({ organizationId: orgId })), await loadAccount()));
  const action = (m: Member) => {
    if (m.userId === me) return onlyOwner ? null : <button type="button" className="wl-link-btn wl-text-error" onClick={leave}>Leave</button>;
    return manage ? <button type="button" className="wl-link-btn wl-text-error" onClick={() => remove(m)}>Remove</button> : null;
  };
  return [
    { key: "name", header: "Name", cell: (m) => <><strong>{m.name}</strong> <span className="wl-muted wl-small">{m.email}</span></> },
    { key: "role", header: "Role", cell: (m) => (manage ? <Select small label={`Role of ${m.name}`} value={m.role} options={ROLE_OPTIONS} onChange={(r) => change(m, r)} /> : m.role) },
    { key: "since", header: "Member since", cell: (m) => fmtDate(m.sinceMs) },
    { key: "x", header: "", cell: action },
  ];
}

/** Who is in the organization and their roles. Managers change roles and remove people; anyone can leave (not the only owner). */
export function MembersPanel({ orgId, me, data, reload }: { orgId: string; me: string; data: OrgData; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const owners = data.members.filter((m) => m.role === "owner");
  const ctx: Ctx = {
    orgId,
    me,
    manage: canManage(data.role),
    onlyOwner: owners.length === 1 && owners[0]!.userId === me,
    run: (fn) => void act(fn, reload).then(setError),
  };
  return (
    <Panel title={`Members (${data.members.length})`}>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      <Table columns={columns(ctx)} rows={data.members} rowKey={(m) => m.memberId} />
    </Panel>
  );
}
