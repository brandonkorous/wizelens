import { HUB_ONLINE_MS } from "@wizeworks/lens-core";
import type { Queryable } from "../db/db.js";
import { KEEP_DAYS } from "./settings.js";

/** Drop registry rows not heard from within the organization's retention, like the traces they sent. Returns how many. */
export async function pruneServices(q: Queryable, now: number): Promise<number> {
  const rows = await q.query(
    `DELETE FROM services s USING projects p, orgs o WHERE p.id = s.project_id AND o.id = p.org_id
     AND s.last_seen < $1 - ${KEEP_DAYS} * 86400000.0 RETURNING s.host`,
    [now],
  );
  return rows.length;
}

/** Forget a project's offline hosts (old pods). The newest host of each service stays, so no service drops off the list. */
export async function forgetOfflineServices(q: Queryable, projectId: string, now: number): Promise<number> {
  const rows = await q.query(
    `DELETE FROM services s WHERE s.project_id = $1 AND s.last_seen < $2 AND EXISTS (
       SELECT 1 FROM services n WHERE n.project_id = s.project_id AND n.service = s.service AND n.environment = s.environment
       AND COALESCE(n.info::jsonb->>'project', '') = COALESCE(s.info::jsonb->>'project', '') AND n.last_seen > s.last_seen
     ) RETURNING s.host`,
    [projectId, now - HUB_ONLINE_MS],
  );
  return rows.length;
}
