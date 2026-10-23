import { useState } from "react";
import { AddButton, ImportButton, SectionHead } from "../../ui/Sections";
import { canManage } from "../organization/orgTypes";
import type { OrgCtx } from "../organization/useOrg";
import { InviteForm, InvitesPanel } from "./InvitesPanel";
import { InviteMany } from "./InviteMany";
import { MembersPanel } from "./MembersPanel";

/** Members and the invites that wait for an answer. */
export function MembersSection({ org, data, me, mail, reload }: OrgCtx) {
  const [inviting, setInviting] = useState<"one" | "many" | null>(null);
  const manage = canManage(data.role);
  const actions = manage && (
    <>
      <ImportButton label="Invite many" onOpen={() => setInviting("many")} />
      <AddButton label="Invite someone" onOpen={() => setInviting("one")} />
    </>
  );
  return (
    <>
      <SectionHead title="Members" description={`Who is in ${org.name}, and what each person may change.`} action={actions} />
      {inviting === "one" && <InviteForm orgId={org.id} mail={mail} reload={reload} onClose={() => setInviting(null)} />}
      {inviting === "many" && <InviteMany orgId={org.id} mail={mail} data={data} reload={reload} onClose={() => setInviting(null)} />}
      <MembersPanel orgId={org.id} me={me} data={data} reload={reload} />
      {manage && data.invites.length > 0 && <InvitesPanel orgId={org.id} mail={mail} data={data} reload={reload} />}
    </>
  );
}
