// One SLO's report, as hosts send it: its status over its window, and how fast its budget burns right now.
import type { Executor } from "../scale/needs.js";
import { computePage } from "../scale/run.js";
import { alignNow } from "../scale/window.js";
import { type Slo, sloBurnPage, sloContext, type SloStatus, sloPage, sloWindowMs } from "./slo.js";

export interface SloReport {
  slo: Slo;
  status: SloStatus;
  /** Burn rate over the last hour and the last 6 hours; null without requests. */
  burn1h: number | null;
  burn6h: number | null;
}

const HOUR_MS = 3_600_000;

/** The report of one SLO, read through a host's executor. */
export async function sloReport(slo: Slo, ex: Executor, now: number): Promise<SloReport> {
  const at = alignNow(now);
  const [status, burn1h, burn6h] = await Promise.all([
    computePage(sloPage(slo), sloContext(sloWindowMs(slo), at), ex),
    computePage(sloBurnPage(slo), sloContext(HOUR_MS, at), ex),
    computePage(sloBurnPage(slo), sloContext(6 * HOUR_MS, at), ex),
  ]);
  return { slo, status, burn1h, burn6h };
}

/** Pages whose models read Apdex targets; hosts load them only for these. */
export const APDEX_PAGES: ReadonlySet<string> = new Set(["overview", "service"]);
