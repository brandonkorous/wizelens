import { type ReactNode, useState } from "react";
import { auth, type Role } from "../../data/account";
import { eachOne, eachText } from "../../data/bulk";
import { Select } from "../../ui/Controls";
import { useAsk } from "../../ui/Dialog";
import { SelectionBar, useSelection } from "../../ui/Selection";
import type { TableSelect } from "../../ui/Table";
import { type Member, type OrgData, ROLE_OPTIONS } from "../organization/orgTypes";

/** Boxes on the other members, and the bar that changes their role or removes them. You change your own role and leave from your own row. */
export function useMembersBulk(orgId: string, me: string, data: OrgData, reload: () => void, onDone: (error: string | null) => void): { select: TableSelect; bar: ReactNode } {
  const others = data.members.filter((m) => m.userId !== me);
  const { picked, select, clear } = useSelection(others.map((m) => m.memberId), "member");
  const [busy, setBusy] = useState(false);
  const { dialog, confirm } = useAsk();
  const chosen = others.filter((m) => picked.includes(m.memberId));
  const run = async (send: (m: Member) => Promise<unknown>, verb: string) => {
    setBusy(true);
    const out = await eachOne(chosen, send);
    setBusy(false);
    clear();
    reload();
    onDone(eachText(out, chosen.length, verb, (m) => m.email));
  };
  const setRole = (role: Role) => void run((m) => auth((c) => c.organization.updateMemberRole({ memberId: m.memberId, role, organizationId: orgId })), "Changed");
  const remove = async () => {
    const n = chosen.length;
    if (!(await confirm({ title: `Remove ${n} ${n === 1 ? "member" : "members"}?`, body: "They lose access to this organization and its data right away.", confirmLabel: "Remove", danger: true }))) return;
    await run((m) => auth((c) => c.organization.removeMember({ memberIdOrEmail: m.memberId, organizationId: orgId })), "Removed");
  };
  const bar = (
    <>
      <SelectionBar count={chosen.length} noun="member" onClear={clear}>
        <Select small label="Change role" value={"" as Role | ""} options={[["", "Change role to…"], ...ROLE_OPTIONS]} onChange={(r) => r && setRole(r)} />
        <button type="button" className="wl-btn wl-btn-danger" disabled={busy} onClick={() => void remove()}>Remove</button>
      </SelectionBar>
      {dialog}
    </>
  );
  return { select, bar };
}
