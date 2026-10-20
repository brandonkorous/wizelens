import type { UptimeCheck, UptimeCheckInput, UptimeList } from "@wizeworks/lens-core";
import { currentProject, useAccount } from "./account";
import { apiSend } from "./api";
import { useHost } from "./host";
import { getScope } from "./prefs";
import { act, useApi } from "./useApi";
import { cloudResource, type InProject } from "./projectScope";

export interface UptimeApi {
  data: UptimeList | null;
  error: string | null;
  reload: () => void;
  /** Viewers and read keys only look. */
  canWrite: boolean;
  save: (draft: UptimeCheckInput, id?: string, projectId?: string) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  runNow: (id: string) => Promise<string | null>;
}

/** Where the checks live: the project's path on the cloud (each check's own under "All projects"), `api/uptime` on a hub (with the project in the query and body). */
function basesOf(cloud: boolean): { list: string | null; item: (projectId?: string) => string } {
  const project = getScope().project;
  if (cloud) return { list: project ? cloudResource("uptime") : null, item: (projectId) => cloudResource("uptime", "", projectId) };
  return { list: `./api/uptime${project ? `?project=${encodeURIComponent(project)}` : ""}`, item: () => "./api/uptime" };
}

/** The project's checks and incidents, and the changes the person may make. */
export function useUptime(): UptimeApi {
  const cloud = useHost().has("accounts");
  const role = currentProject(useAccount())?.org.role;
  const { list, item } = basesOf(cloud);
  const { data, error, reload } = useApi<UptimeList>(list);
  const project = getScope().project;
  // Under "All projects" each check says its project; its changes go there.
  const at = (id: string) => item((data?.checks.find((c) => c.id === id) as InProject<UptimeCheck> | undefined)?.projectId);
  const save = (draft: UptimeCheckInput, id?: string, projectId?: string) =>
    act(() => (id ? apiSend<UptimeCheck>("PATCH", `${at(id)}/${id}`, draft) : apiSend<UptimeCheck>("POST", item(projectId), cloud ? draft : { ...draft, project })), reload);
  return {
    data,
    error,
    reload,
    canWrite: !cloud || (role !== undefined && role !== "viewer"),
    save,
    remove: (id) => act(() => apiSend("DELETE", `${at(id)}/${id}`), reload),
    runNow: (id) => act(() => apiSend("POST", `${at(id)}/${id}/run`), reload),
  };
}
