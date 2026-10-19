import { useCallback, useEffect, useState } from "react";
import { cleanSearchParams, type SavedSearch } from "@wizeworks/lens-core";
import { apiFetch, apiSend } from "./api";
import { useHost } from "./host";
import { getScope } from "./prefs";

export interface SavedSearches {
  searches: SavedSearch[];
  error: string | null;
  /** Save the filters under a name; the error message, or null. */
  save: (name: string, params: Record<string, string>) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
}

const STORE_KEY = "wizelens.ui.logSearches";

function readLocal(): SavedSearch[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as SavedSearch[];
  } catch {
    return [];
  }
}

function writeLocal(list: SavedSearch[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: the searches last for this page only.
  }
}

/** Where the host keeps saved log searches: per project on the cloud, per hub project on the hub. */
function baseUrl(cloud: boolean): string | null {
  const project = getScope().project;
  if (cloud) return project ? `./api/projects/${encodeURIComponent(project)}/saved-searches` : null;
  return "./api/saved-searches";
}

const query = (cloud: boolean) => (cloud ? "?kind=logs" : `?kind=logs&project=${encodeURIComponent(getScope().project)}`);

const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Saved log searches: on hosts that keep them (hub, cloud), shared there; elsewhere in this browser. */
export function useSavedSearches(): SavedSearches {
  const host = useHost();
  const server = host.has("savedSearches");
  const base = server ? baseUrl(host.mode === "cloud") : null;
  const [searches, setSearches] = useState<SavedSearch[]>(() => (server ? [] : readLocal()));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!server) return void setSearches(readLocal());
    if (!base) return;
    let live = true;
    apiFetch<{ searches: SavedSearch[] }>(`${base}${query(host.mode === "cloud")}`).then((r) => live && (setSearches(r.searches), setError(null)), (e: unknown) => live && setError(errorOf(e)));
    return () => void (live = false);
  }, [server, base, host.mode, nonce]);
  const run = useCallback(async (change: () => unknown) => {
    try {
      await change();
      setNonce((n) => n + 1);
      return null;
    } catch (e) {
      return errorOf(e);
    }
  }, []);
  const q = query(host.mode === "cloud");
  const save = (name: string, params: Record<string, string>) =>
    run(() => (server ? apiSend("POST", `${base}${q}`, { kind: "logs", name, params }) : writeLocal([...readLocal(), localSearch(name, params)])));
  const remove = (id: string) => run(() => (server ? apiSend("DELETE", `${base}/${encodeURIComponent(id)}${q}`) : writeLocal(readLocal().filter((s) => s.id !== id))));
  return { searches, error, save, remove };
}

const localSearch = (name: string, params: Record<string, string>): SavedSearch => ({ id: crypto.randomUUID(), kind: "logs", name: name.trim(), params: cleanSearchParams(params), createdMs: Date.now(), createdBy: null });
