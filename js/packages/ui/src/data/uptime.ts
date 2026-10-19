import type { UptimeCheck, UptimeCheckInput, UptimeList } from "@wizeworks/lens-core";
import { currentProject, useAccount } from "./account";
import { apiSend } from "./api";
import { useHost } from "./host";
import { getScope } from "./prefs";
import { act, useApi } from "./useApi";

export interface UptimeApi {
  data: UptimeList | null;
  error: string | null;
  reload: () => void;
  /** Viewers and read keys only look. */
  canWrite: boolean;
  save: (draft: UptimeCheckInput, id?: string) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  runNow: (id: string) => Promise<string | null>;
}

/** Where the checks live: the project's path on the cloud, `api/uptime` on a hub (with the project in the query and body). */
function basesOf(cloud: boolean): { list: string | null; item: string } {
  const project = getScope().project;
  if (cloud) return { list: project ? `./api/projects/${project}/uptime` : null, item: `./api/projects/${project}/uptime` };
  return { list: `./api/uptime${project ? `?project=${encodeURIComponent(project)}` : ""}`, item: "./api/uptime" };
}

/** The project's checks and incidents, and the changes the person may make. */
export function useUptime(): UptimeApi {
  const cloud = useHost().has("accounts");
  const role = currentProject(useAccount())?.org.role;
  const { list, item } = basesOf(cloud);
  const { data, error, reload } = useApi<UptimeList>(list);
  const project = getScope().project;
  const save = (draft: UptimeCheckInput, id?: string) =>
    act(() => (id ? apiSend<UptimeCheck>("PATCH", `${item}/${id}`, draft) : apiSend<UptimeCheck>("POST", item, cloud ? draft : { ...draft, project })), reload);
  return {
    data,
    error,
    reload,
    canWrite: !cloud || (role !== undefined && role !== "viewer"),
    save,
    remove: (id) => act(() => apiSend("DELETE", `${item}/${id}`), reload),
    runNow: (id) => act(() => apiSend("POST", `${item}/${id}/run`), reload),
  };
}
