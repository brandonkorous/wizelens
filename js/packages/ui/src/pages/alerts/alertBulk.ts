// Alerts in bulk: one rule made in many projects (cloud), and mute, unmute, on, off, or delete for many rules (cloud in one call per part, the hub one by one).
import { MAX_BULK } from "@wizeworks/lens-core/internal";
import { apiSend } from "../../data/api";
import { inParts, type PartsRun } from "../../data/bulk";
import type { AlertRule } from "./alertTypes";
import type { RuleDraft } from "./AlertForm";

export type RuleAction = "mute" | "unmute" | "enable" | "disable" | "delete";
type Url = (path?: string, projectId?: string) => string;

const failText = <T, R>(run: PartsRun<T, R>, total: number, verb: string) =>
  run.error && (run.done.length ? `${verb} ${run.done.length} of ${total}, then stopped: ${run.error}` : run.error);

/** The same rule in every picked project. Returns an error message, or null. */
export async function copyRule(orgId: string, rule: RuleDraft, projectIds: string[]): Promise<string | null> {
  const send = async (part: string[]) => (await apiSend<{ created: unknown[] }>("POST", `./api/orgs/${encodeURIComponent(orgId)}/alerts/copy`, { rule, projectIds: part })).created;
  return failText(await inParts(projectIds, MAX_BULK, send), projectIds.length, "Made the alert in");
}

/** One rule's change on a host with no bulk call (the hub). */
function sendOne(url: Url, r: AlertRule, action: RuleAction, untilMs: number | null) {
  const path = `/${encodeURIComponent(r.id)}`;
  if (action === "delete") return apiSend("DELETE", url(path, r.projectId));
  if (action === "enable" || action === "disable") return apiSend("PATCH", url(path, r.projectId), { enabled: action === "enable" });
  return apiSend("POST", url(`${path}/mute`, r.projectId), { untilMs: action === "mute" ? untilMs : null });
}

/** Apply one action to many rules. `untilMs` is for mute: a time, or -1 until unmuted. Returns an error message, or null. */
export async function changeRules(cloud: boolean, orgId: string, url: Url, rules: AlertRule[], action: RuleAction, untilMs: number | null = null): Promise<string | null> {
  const bulk = async (part: AlertRule[]) => {
    await apiSend("POST", `./api/orgs/${encodeURIComponent(orgId)}/alerts/bulk`, { action, untilMs, rules: part.map((r) => ({ projectId: r.projectId, id: r.id })) });
    return part;
  };
  const one = async ([r]: AlertRule[]) => (await sendOne(url, r!, action, untilMs), [r!]);
  return failText(await inParts(rules, cloud ? MAX_BULK : 1, cloud ? bulk : one), rules.length, "Changed");
}
