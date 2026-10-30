import type { Trace } from "@wizeworks/lens-core/internal";
import type { Queryable } from "../db/db.js";
import { type TenantScope, tenantScope } from "../telemetry/store.js";
import { getTrace } from "./trace-read.js";

/** Every project of one organization. */
export async function orgProjectIds(q: Queryable, orgId: string): Promise<string[]> {
  const rows = await q.query<{ id: string }>("SELECT id FROM projects WHERE org_id = $1", [orgId]);
  return rows.map((r) => r.id);
}

/** The projects of `ids` that belong to `orgId`. Anything outside the organization is dropped. */
export async function inOrg(q: Queryable, orgId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await q.query<{ id: string }>("SELECT id FROM projects WHERE org_id = $1 AND id = ANY($2)", [orgId, [...ids]]);
  return rows.map((r) => r.id);
}

/** One trace with its parts from the projects in `scope` (already checked: readable by the caller). Undefined when the primary project has no part. */
export async function getJoinedTrace(q: Queryable, primaryId: string, scope: TenantScope, traceId: string): Promise<Trace | undefined> {
  const own = await getTrace(q, tenantScope(scope.org, [primaryId]), traceId);
  if (!own || scope.projects.every((id) => id === primaryId)) return own;
  return getTrace(q, tenantScope(scope.org, [primaryId, ...scope.projects]), traceId);
}
