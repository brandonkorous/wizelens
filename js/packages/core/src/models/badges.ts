import type { PageDef } from "../scale/needs.js";
import { issueKeys, lifeNeed } from "./error-issues.js";
import { groupNeed, rowsOf } from "./read.js";

/** Counts for the sidebar. */
export interface BadgesModel {
  /** Exceptions in the range in groups still open, for the chosen service when one is: resolved and ignored groups count again when they come back. */
  errors: number;
}

/** The sidebar badges. Params: service (the scope chip), as on the Errors page. */
export const badgesPage: PageDef<BadgesModel> = {
  needs: (ctx) => {
    const service = ctx.params.service ?? "";
    return [groupNeed("err.g", "err.g", "cur", service ? { filter: { prefix: `${service}|` } } : {}), lifeNeed(service)];
  },
  model(d) {
    const closed = new Set(issueKeys(d, d, "unresolved", null).exclude ?? []);
    return { errors: rowsOf(d, "err.g").reduce((n, r) => n + (closed.has(r.key) ? 0 : r.agg.n), 0) };
  },
};
