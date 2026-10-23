import { type ReactNode, useState } from "react";
import { currentProject, useAccount } from "../../data/account";
import { apiSend } from "../../data/api";
import { useHost } from "../../data/host";
import { getScope } from "../../data/prefs";
import { isAllProjects } from "../../data/projectScope";
import { act } from "../../data/useApi";
import { ProjectPicker } from "../../ui/ProjectPicker";
import { copyRule } from "./alertBulk";
import type { RuleDraft } from "./AlertForm";

type Url = (path?: string, projectId?: string) => string;

/** Where a new alert goes. On the cloud with more than one project you may change, pick any of them: the rule is made in each. */
export function useRuleTargets(): { field: ReactNode; create: (r: RuleDraft, url: Url, reload: () => void) => Promise<string | null> } {
  const cloud = useHost().has("accounts");
  const org = currentProject(useAccount())?.org;
  const writable = (org?.projects ?? []).filter((p) => (p.role ?? org?.role) !== "viewer");
  const [picked, setPicked] = useState<string[] | null>(null);
  const start = isAllProjects() ? writable[0]?.id : getScope().project;
  const ids = picked ?? (start ? [start] : []);
  const field = cloud && writable.length > 1 ? <ProjectPicker projects={writable} picked={ids} onChange={setPicked} legend="Make this alert in" /> : null;
  const create = async (r: RuleDraft, url: Url, reload: () => void) => {
    if (!cloud || !org) return act(() => apiSend("POST", url(""), r), reload);
    if (ids.length === 0) return "Pick at least one project.";
    if (ids.length === 1) return act(() => apiSend("POST", url("", ids[0]), r), reload);
    const err = await copyRule(org.id, r, ids);
    reload();
    return err;
  };
  return { field, create };
}
