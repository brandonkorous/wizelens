// Users affected: how many signed-in users (`enduser.id`) an error group, an insight, or an endpoint touched, and the top ones.
import { splitKey } from "../scale/kinds.js";
import type { GroupNeed, NeedResults } from "../scale/needs.js";
import { groupCount, groupNeed, rowsOf } from "./read.js";

export interface UsersAffected {
  /** Distinct users in the range. */
  count: number;
  /** The users it touched most, with how many times. */
  top: { user: string; count: number }[];
}

const TOP_USERS = 10;

/** The users of one item: keys of `kind` that start with `head` and end with the user. */
export const usersNeed = (id: string, kind: "err.u" | "ins.u" | "ep.u" | "sec.u", head: readonly string[]): GroupNeed =>
  groupNeed(id, kind, "cur", { filter: { parts: [...head, null] }, order: { by: "n", desc: true, limit: TOP_USERS } });

export function usersOf(d: NeedResults, id: string): UsersAffected {
  return { count: groupCount(d, id), top: rowsOf(d, id).map((r) => ({ user: splitKey(r.key).at(-1)!, count: r.agg.n })) };
}
