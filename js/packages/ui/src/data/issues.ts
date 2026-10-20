// Issue states from the host (hub or cloud), and changes to them: resolve, ignore, reopen, assign.
import { useSyncExternalStore } from "react";
import type { IssueAction, IssueKind, IssueState } from "@wizeworks/lens-core";
import { apiSend } from "./api";
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
