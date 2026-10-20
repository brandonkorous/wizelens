// Saved views, searches, and dashboards: where the host keeps them, and one list every part of the page shares.
import { useSyncExternalStore } from "react";
import type { SavedInput, SavedItem } from "@wizeworks/lens-core";
import { currentProject, useAccount } from "./account";
import { apiSend } from "./api";
import { useHost } from "./host";
import { getScope } from "./prefs";
import { useApi } from "./useApi";
import { cloudResource, isAllProjects } from "./projectScope";

const listeners = new Set<() => void>();
let tick = 0;
const bump = () => (tick++, listeners.forEach((l) => l()));
const useTick = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => tick);

/** The host's saved items: the cloud by project id, or the organization's under "All projects" (an item of one project keeps its own); the hub by `?project=`. */
export function useSavedApi(): { url: (path?: string, projectId?: string) => string; on: boolean; ready: boolean; canWrite: boolean; cloud: boolean } {
  const host = useHost();
  const cloud = host.has("accounts");
  const role = currentProject(useAccount())?.org.role;
  const project = getScope().project;
  const url = (path = "", projectId?: string) => (cloud ? cloudResource("saved", path, projectId) : `./api/saved${path}?project=${encodeURIComponent(project)}`);
  return { url, on: host.has("saved"), ready: !cloud || !!project, canWrite: !cloud || (role !== undefined && role !== "viewer"), cloud };
}

/** Every item this person sees, of one kind or all. Reloads after any change made here. */
export function useSavedItems(kind?: SavedItem["kind"]): { items: SavedItem[]; error: string | null } {
  const api = useSavedApi();
  const t = useTick();
  const base = api.url();
  const { data, error } = useApi<{ items: SavedItem[] }>(api.on && api.ready ? `${base}${base.includes("?") ? "&" : "?"}t=${t}` : null);
  return { items: (data?.items ?? []).filter((i) => !kind || i.kind === kind), error };
}

/** Add, change, or delete an item; every list reloads. Returns the item (or null), or throws the host's message. */
export async function changeSaved(url: string, method: "POST" | "PATCH" | "DELETE", body?: Partial<SavedInput>): Promise<SavedItem | null> {
  const out = await apiSend<SavedItem | { ok: true }>(method, url, body);
  bump();
  return "id" in out ? out : null;
}

/** Where an item opens: under "All projects", an item of one project opens in that project. */
export function savedHref(i: SavedItem): string {
  if (!i.projectId || !isAllProjects()) return i.href;
  const [path, query = ""] = i.href.split("?");
  const q = new URLSearchParams(query);
  q.set("project", i.projectId);
  return `${path}?${q.toString()}`;
}
