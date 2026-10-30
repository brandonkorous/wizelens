// Issue states from the host (hub or cloud), and changes to them: resolve, ignore, reopen, assign.
import { useSyncExternalStore } from "react";
import { type IssueAction, type IssueKind, type IssueState, MAX_BULK } from "@wizeworks/lens-core/internal";
import { apiSend } from "./api";
import { inParts } from "./bulk";
import { useHost } from "./host";
import { getScope, useProjectScope } from "./prefs";
import { useApi } from "./useApi";
import { cloudResource } from "./projectScope";

export interface Member {
  id: string;
  name: string;
  email: string;
}

const listeners = new Set<() => void>();
let tick = 0;

/** Goes up after every change, so page models that show states load again. */
export const useIssueTick = (): number => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => tick);

/** The host's issues endpoint for the chosen project: the cloud keys it by project id, or by organization under "All projects" (labeled keys find their project). */
function issuesUrl(cloud: boolean, project: string): string {
  return cloud ? cloudResource("issues") : `./api/issues?project=${encodeURIComponent(project)}`;
}

/** Members issues can be assigned to (cloud), and whether this host keeps issues at all. */
export function useIssueMembers(): { on: boolean; members: Member[] } {
  const host = useHost();
  const [project] = useProjectScope();
  const cloud = host.has("accounts");
  const on = host.has("issues") && (!cloud || !!project);
  const { data } = useApi<{ issues: IssueState[]; members: Member[] }>(on && cloud ? issuesUrl(true, project) : null);
  return { on, members: data?.members ?? [] };
}

/** Send one change; the pages showing issues load again. Returns an error message, or null. */
export async function changeIssue(cloud: boolean, kind: IssueKind, key: string, action: IssueAction, extra: { untilMs?: number | null; assignee?: string | null } = {}): Promise<string | null> {
  try {
    await apiSend("POST", issuesUrl(cloud, getScope().project), { kind, key, action, ...extra });
    tick++;
    for (const l of listeners) l();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** The same change to many issues, sent in parts. Returns an error message (naming how many changed first), or null. */
export async function changeIssues(cloud: boolean, kind: IssueKind, keys: string[], action: IssueAction, extra: { untilMs?: number | null; assignee?: string | null } = {}): Promise<string | null> {
  const send = async (part: string[]) => (await apiSend("POST", issuesUrl(cloud, getScope().project), { kind, keys: part, action, ...extra }), part);
  const run = await inParts(keys, MAX_BULK, send);
  tick++;
  for (const l of listeners) l();
  return run.error && (run.done.length ? `Changed ${run.done.length} of ${keys.length}, then stopped: ${run.error}` : run.error);
}
