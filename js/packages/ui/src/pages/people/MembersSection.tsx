import { useState } from "react";
import { AddButton, SectionHead } from "../../ui/Sections";
import { canManage } from "../organization/orgTypes";
import type { OrgCtx } from "../organization/useOrg";
import { InviteForm, InvitesPanel } from "./InvitesPanel";
import { MembersPanel } from "./MembersPanel";

/** Members and the invites that wait for an answer. */
export function MembersSection({ org, data, me, mail, reload }: OrgCtx) {
  const [inviting, setInviting] = useState(false);
  const manage = canManage(data.role);
  return (
    <>
      <SectionHead title="Members" description={`Who is in ${org.name}, and what each person may change.`} action={manage && <AddButton label="Invite someone" onOpen={() => setInviting(true)} />} />
      {inviting && <InviteForm orgId={org.id} mail={mail} reload={reload} onClose={() => setInviting(false)} />}
      <MembersPanel orgId={org.id} me={me} data={data} reload={reload} />
      {manage && data.invites.length > 0 && <InvitesPanel orgId={org.id} mail={mail} data={data} reload={reload} />}
    </>
  );
}
