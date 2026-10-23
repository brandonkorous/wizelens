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
  /** The same calls without reloading, for many at once: they throw on failure; reload after. */
  quiet: {
    create: (draft: UptimeCheckInput, projectId?: string) => Promise<unknown>;
    patch: (id: string, body: Partial<UptimeCheckInput>) => Promise<unknown>;
    remove: (id: string) => Promise<unknown>;
    run: (id: string) => Promise<unknown>;
  };
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
  const quiet = {
    create: (draft: UptimeCheckInput, projectId?: string) => apiSend<UptimeCheck>("POST", item(projectId), cloud ? draft : { ...draft, project }),
    patch: (id: string, body: Partial<UptimeCheckInput>) => apiSend<UptimeCheck>("PATCH", `${at(id)}/${id}`, body),
    remove: (id: string) => apiSend("DELETE", `${at(id)}/${id}`),
    run: (id: string) => apiSend("POST", `${at(id)}/${id}/run`),
  };
  const save = (draft: UptimeCheckInput, id?: string, projectId?: string) => act(() => (id ? quiet.patch(id, draft) : quiet.create(draft, projectId)), reload);
  return {
    data,
    error,
    reload,
    canWrite: !cloud || (role !== undefined && role !== "viewer"),
    save,
    remove: (id) => act(() => quiet.remove(id), reload),
    runNow: (id) => act(() => quiet.run(id), reload),
    quiet,
  };
}
