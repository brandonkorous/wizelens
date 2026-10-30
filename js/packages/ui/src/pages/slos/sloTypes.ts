import type { ApdexTargets, SloReport } from "@wizeworks/lens-core/internal";
import { currentProject, useAccount } from "../../data/account";
import { useHost } from "../../data/host";
import { getScope } from "../../data/prefs";
import { cloudResource, isAllProjects } from "../../data/projectScope";

export interface SlosData {
  slos: SloReport[];
  apdex: ApdexTargets;
}

/** Where a host keeps SLOs and Apdex targets: the cloud by project id, the hub by `?project=`. */
export function useSlosApi(): { url: (path?: string, projectId?: string) => string; apdexUrl: string | null; ready: boolean; canWrite: boolean } {
  const cloud = useHost().has("accounts");
  const role = currentProject(useAccount())?.org.role;
  const project = getScope().project;
  const q = `?project=${encodeURIComponent(project)}`;
  const url = (path = "", projectId?: string) => (cloud ? cloudResource("slos", path, projectId) : `./api/slos${path}${q}`);
  // Apdex targets belong to one project: none under "All projects".
  const apdexUrl = cloud ? (isAllProjects() ? null : `./api/projects/${encodeURIComponent(project)}/apdex`) : `./api/apdex${q}`;
  return { url, apdexUrl, ready: !cloud || !!project, canWrite: !cloud || (role !== undefined && role !== "viewer") };
}

/** "99.9%" with as many decimals as the target has, at least one. */
export const fmtSli = (v: number | null, target: number): string => {
  if (v === null) return "–";
  const decimals = Math.max(1, (String(target).split(".")[1] ?? "").length);
  return `${v.toFixed(decimals)}%`;
};

export const fmtBurn = (v: number | null): string => (v === null ? "–" : `${v.toFixed(1)}×`);

/** Budget left as a percent; once spent, how many budgets the bad requests used ("Spent: 3.2× the budget"). */
export const fmtBudget = (v: number | null): string => (v === null ? "–" : v > 0 ? `${Math.round(v * 100)}%` : `Spent: ${(1 - v).toFixed(1)}× the budget`);

export const budgetTone = (v: number | null): "success" | "warning" | "danger" | "neutral" => (v === null ? "neutral" : v <= 0 ? "danger" : v < 0.25 ? "warning" : "success");

/** "API latency: 99% of requests in 300 ms over 30 days". */
export function sloGoal(s: SloReport["slo"]): string {
  const scope = s.endpoint ? `${s.endpoint} (${s.service})` : s.service;
  const good = s.kind === "success" ? "succeed" : `finish in ${s.thresholdMs} ms`;
  return `${s.target}% of ${scope} requests ${good}, over ${s.windowDays} days`;
}
