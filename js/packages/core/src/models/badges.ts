import type { PageDef } from "../scale/needs.js";
import { groupNeed, totalOf } from "./read.js";

/** Counts for the sidebar. */
export interface BadgesModel {
  /** Exceptions in the range, the same number as "Total Exceptions" on the Errors page. */
  errors: number;
}

/** The sidebar badges. */
export const badgesPage: PageDef<BadgesModel> = {
  needs: () => [groupNeed("err", "err", "cur")],
  model: (d) => ({ errors: totalOf(d, "err").n }),
};
