import { useState } from "react";
import { auth, loadAccount, type Role } from "../../data/account";
import { act } from "../../data/useApi";
import { fmtDate } from "../../format";
import { Select } from "../../ui/Controls";
import { useAsk } from "../../ui/Dialog";
import { Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { canManage, type Member, type OrgData, ROLE_LABEL, ROLE_OPTIONS } from "./teamTypes";

interface Ctx {
  orgId: string;
  me: string;
  manage: boolean;
  /** True when this person is the only owner: they cannot leave. */
  onlyOwner: boolean;
  run: (fn: () => Promise<unknown>) => void;
  confirm: ReturnType<typeof useAsk>["confirm"];
}

function actionOf({ orgId, me, manage, onlyOwner, run, confirm }: Ctx, m: Member) {
  const remove = async () =>
    (await confirm({ title: `Remove ${m.name}?`, body: `${m.name} loses access to this organization and its data right away.`, confirmLabel: "Remove", danger: true })) &&
    run(() => auth((c) => c.organization.removeMember({ memberIdOrEmail: m.memberId, organizationId: orgId })));
  const leave = async () =>
    (await confirm({ title: "Leave this organization?", body: "You lose access to its data. Someone must invite you again to come back.", confirmLabel: "Leave", danger: true })) &&
    run(async () => (await auth((c) => c.organization.leave({ organizationId: orgId })), await loadAccount()));
  if (m.userId === me) return onlyOwner ? null : <button type="button" className="wl-link-btn wl-text-error" onClick={() => void leave()}>Leave</button>;
  return manage ? <button type="button" className="wl-link-btn wl-text-error" onClick={() => void remove()}>Remove</button> : null;
}

function columns(ctx: Ctx): Column<Member>[] {
  const change = (m: Member, role: Role) =>
    ctx.run(async () => {
      await auth((c) => c.organization.updateMemberRole({ memberId: m.memberId, role, organizationId: ctx.orgId }));
      if (m.userId === ctx.me) await loadAccount();
    });
  return [
    { key: "name", header: "Name", cell: (m) => <span className="wl-who"><strong>{m.name}{m.userId === ctx.me && <span className="wl-muted"> (you)</span>}</strong><small>{m.email}</small></span> },
    { key: "role", header: "Role", cell: (m) => (ctx.manage ? <Select small label={`Role of ${m.name}`} value={m.role} options={ROLE_OPTIONS} onChange={(r) => change(m, r)} /> : ROLE_LABEL[m.role]) },
    { key: "since", header: "Member since", cell: (m) => fmtDate(m.sinceMs), className: "wl-nowrap" },
    { key: "x", header: "", cell: (m) => actionOf(ctx, m), className: "wl-cell-actions" },
  ];
}

/** Who is in the organization and their roles. Managers change roles and remove people; anyone can leave (not the only owner). */
export function MembersPanel({ orgId, me, data, reload }: { orgId: string; me: string; data: OrgData; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { dialog, confirm } = useAsk();
  const owners = data.members.filter((m) => m.role === "owner");
  const ctx: Ctx = {
    orgId,
    me,
    manage: canManage(data.role),
    onlyOwner: owners.length === 1 && owners[0]!.userId === me,
    run: (fn) => void act(fn, reload).then(setError),
    confirm,
  };
  return (
    <Panel title="Members" flush>
      {error && <div className="wl-banner wl-banner-error wl-panel-banner">{error}</div>}
      <Table columns={columns(ctx)} rows={data.members} rowKey={(m) => m.memberId} />
      {dialog}
    </Panel>
  );
}
