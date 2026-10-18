import { APIError } from "better-auth/api";
import type { Db, Queryable } from "../db/db.js";
import { deleteOrgEverything } from "../repo/orgs.js";

export interface OwnedOrg {
  id: string;
  name: string;
  owners: number;
  members: number;
}

/** Organizations the person owns, with how many owners and members each has. */
export const ownedOrgs = (q: Queryable, userId: string): Promise<OwnedOrg[]> =>
  q.query<OwnedOrg>(
    `SELECT o.id, o.name,
       (SELECT count(*)::int FROM members x WHERE x.org_id = o.id AND x.role = 'owner') AS owners,
       (SELECT count(*)::int FROM members x WHERE x.org_id = o.id) AS members
     FROM members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1 AND m.role = 'owner' ORDER BY o.name`,
    [userId],
  );

/** Organizations that would be left without an owner: they block deleting the account. */
export const blockingOrgs = (orgs: readonly OwnedOrg[]) => orgs.filter((o) => o.owners === 1 && o.members > 1);

/** Before an account goes: refuse while it is the last owner of a team; delete the organizations it is alone in, with their data. */
export function beforeDeleteUser(db: Db) {
  return async (user: { id: string }): Promise<void> => {
    const orgs = await ownedOrgs(db, user.id);
    const blocked = blockingOrgs(orgs);
    if (blocked.length) throw new APIError("BAD_REQUEST", { message: `Make someone else an owner of ${blocked.map((o) => o.name).join(", ")} first, or delete it.` });
    for (const o of orgs.filter((x) => x.members === 1)) await db.tx((q) => deleteOrgEverything(q, o.id));
  };
}
