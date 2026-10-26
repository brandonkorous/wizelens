// The Users page (everyone signed in, by requests) and one user's page: their requests, failures, slowest requests, and errors.
import type { RequestItem } from "../scale/facts-lists.js";
import { histPercentile } from "../scale/hist.js";
import { splitKey } from "../scale/kinds.js";
import type { Agg } from "../scale/agg.js";
import type { PageDef } from "../scale/needs.js";
import { bucketStarts, percentOf } from "../stats/common.js";
import type { ErrorGroup } from "../stats/errors.js";
import { CHART_BUCKETS } from "./database.js";
import { errorGroupOf } from "./errors.js";
import { META_NEEDS, type ModelMeta, type ModelParams, metaOf, pageParams } from "./input.js";
import { groupPage, type PageInfo } from "./paged.js";
import { avgs, byDesc, groupCount, groupNeed, listNeed, listOf, rowsOf, type Series, uniqueNeeds } from "./read.js";

export interface UserRow {
  user: string;
  /** The newest display name the app sent for this user, or null. */
  name: string | null;
  requests: number;
  errors: number;
  errorRate: number | null;
  avgMs: number | null;
  p95Ms: number | null;
  lastSeenMs: number;
}

/** The name kept as the row's top item. */
const nameOf = (top: unknown): string | null => {
  const name = (top as { name?: unknown } | null)?.name;
  return typeof name === "string" && name ? name : null;
};

const rowOf = (user: string, a: Agg): UserRow => ({
  user,
  name: nameOf(a.top),
  requests: a.n,
  errors: a.err,
  errorRate: a.n ? percentOf(a.err, a.n) : null,
  avgMs: a.n ? a.sum / a.n : null,
  p95Ms: a.hist && a.n ? histPercentile(a.hist, a.n, 95) : null,
  lastSeenMs: a.lastMs,
});

export interface UsersModel {
  meta: ModelMeta;
  /** One page of users, most requests first. */
  users: UserRow[];
  total: number;
  page: number;
  size: number;
}

const USERS_PAGE = 25;

/** The Users page. Params: q (text in the user id), page, size. */
export const usersPage: PageDef<UsersModel> = {
  needs: (ctx) => {
    const { page, size } = pageParams(ctx.params, USERS_PAGE);
    const q = ctx.params.q?.trim();
    const filter = q ? { filter: { contains: [q] } } : {};
    return uniqueNeeds([...META_NEEDS, groupNeed("usr", "usr", "cur", { hist: true, top: true, ...filter, order: { by: "n", desc: true, limit: size, offset: (page - 1) * size } })]);
  },
  model: (d) => ({
    meta: metaOf(d),
    users: [...rowsOf(d, "usr")].sort(byDesc((r) => r.agg.n)).map((r) => rowOf(r.key, r.agg)),
    total: groupCount(d, "usr"),
    ...pageParams(d.params, USERS_PAGE),
  }),
};

export interface UserModel {
  meta: ModelMeta;
  user: string;
  /** Null when the user did nothing in the range. */
  totals: UserRow | null;
  starts: number[];
  chart: { requests: Series; errors: Series; avgMs: Series };
  recent: RequestItem[];
  slowest: RequestItem[];
  /** Error groups the user ran into, most often first, with how many times. */
  errors: { group: ErrorGroup; count: number }[];
  /** Where the pages of the newest requests ("req") and the errors ("err") sit. */
  paging: { recent: PageInfo; errors: PageInfo };
}

/** Newest requests and error groups a page shows at first. */
export const USER_PAGE_SIZE = 10;
const userErrorPage = (p: ModelParams) => groupPage(p, "err", USER_PAGE_SIZE, { n: "n" }, { key: "n", desc: true });

/** One user's page. Params: user; reqpage, reqsize for the newest requests; errpage, errsize, errsort for the errors. */
export const userPage: PageDef<UserModel> = {
  needs: (ctx) => {
    const user = ctx.params.user ?? "";
    return uniqueNeeds([
      ...META_NEEDS,
      groupNeed("usr", "usr", "cur", { hist: true, top: true, filter: { keys: [user] } }),
      listNeed("recent", "requests", "cur", { filter: { user }, sort: { key: "time", desc: true }, page: pageParams(ctx.params, USER_PAGE_SIZE, "req"), aggregate: { buckets: CHART_BUCKETS } }),
      listNeed("slowest", "requests", "cur", { filter: { user }, sort: { key: "duration", desc: true }, limit: 10 }),
      groupNeed("u.groups", "err.u", "cur", { filter: { parts: [null, user] }, order: userErrorPage(ctx.params).order }),
    ]);
  },
  followUp(_ctx, first) {
    const keys = rowsOf(first, "u.groups").map((r) => splitKey(r.key)[0]!);
    return keys.length ? [groupNeed("groups", "err.g", "cur", { top: true, filter: { keys } })] : [];
  },
  model(d) {
    const user = d.params.user ?? "";
    const a = rowsOf(d, "usr")[0]?.agg;
    const recent = listOf<RequestItem>(d, "recent");
    const series = recent.aggregate?.series ?? [];
    const groups = new Map(rowsOf(d, "groups").map((r) => [r.key, errorGroupOf(r)]));
    const errors = rowsOf(d, "u.groups").flatMap((r) => {
      const g = groups.get(splitKey(r.key)[0]!);
      return g ? [{ group: g, count: r.agg.n }] : [];
    });
    return {
      meta: metaOf(d),
      user,
      totals: a?.n ? rowOf(user, a) : null,
      starts: bucketStarts(d.window, CHART_BUCKETS),
      chart: { requests: series.map((s) => s.n), errors: series.map((s) => s.err), avgMs: avgs(series) },
      recent: recent.items,
      slowest: listOf<RequestItem>(d, "slowest").items,
      errors,
      paging: {
        recent: { key: "req", total: recent.total ?? recent.items.length, page: recent.page, size: recent.pageSize || USER_PAGE_SIZE, sort: null },
        errors: userErrorPage(d.params).paging(groupCount(d, "u.groups")),
      },
    };
  },
};
