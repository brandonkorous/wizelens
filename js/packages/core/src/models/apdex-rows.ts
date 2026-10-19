// Apdex from the Services rows (the svc kind, with histograms): one service, or every service that runs your code.
import type { GroupNeed, NeedResults, PageContext } from "../scale/needs.js";
import { displayService } from "../stats/errors.js";
import { type Apdex, apdexOf, apdexOfMany, apdexTargetOf } from "./apdex.js";
import { groupNeed, rowsOf } from "./read.js";

/** The rows Apdex reads: every service, or one Services row key ("api:orders"). */
export const apdexNeed = (rowKey?: string): GroupNeed => groupNeed("apdex", "svc", "cur", { hist: true, ...(rowKey ? { filter: { keys: [rowKey] } } : {}) });

/** Apdex per service that runs your code (APIs and workers), by display name. */
export function apdexByService(d: NeedResults & Pick<PageContext, "apdex">): Map<string, Apdex> {
  const out = new Map<string, Apdex>();
  for (const r of rowsOf(d, "apdex")) {
    const [kind, ...rest] = r.key.split(":");
    if (kind !== "api" && kind !== "worker") continue;
    const name = displayService(rest.join(":"));
    out.set(name, apdexOf(r.agg, apdexTargetOf(d.apdex, name)));
  }
  return out;
}

/** Apdex of every service together, each against its own target. */
export const apdexOverall = (d: NeedResults & Pick<PageContext, "apdex">): Apdex | null => apdexOfMany([...apdexByService(d).values()]);
