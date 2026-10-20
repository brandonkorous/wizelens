// The project's tags in the dashboard (docs/TAGS-PLAN.md): one shared list, fetched once per project, and changes to it.
import { useEffect, useSyncExternalStore } from "react";
import { activeTags, type ActiveTag, TAG_LIMITS, type TagInput, type TagList, type TagRule } from "@wizeworks/lens-core";
import { apiFetch, apiSend } from "./api";
import { useHost } from "./host";
import { getScope, onPrefChange } from "./prefs";
import { projectQuery } from "./projectScope";

/** What a host without tags (or an older one) shows: nothing to tag with, nothing to change. */
export const NO_TAGS: TagList = { tags: [], editable: false, max: TAG_LIMITS.rules };

interface Loaded {
  key: string;
  list: TagList;
  active: ActiveTag[];
}

let loaded: Loaded | null = null;
let pending: string | null = null;
const listeners = new Set<() => void>();

const scopeKey = () => projectQuery();

/** `?project=` for the tags API: rules belong to a project on the cloud (all of an organization's to read), to the whole hub elsewhere. */
export const tagScopeQuery = (): string => {
  const project = projectQuery();
  return project ? `?${project}` : "";
};

function set(next: Loaded): void {
  loaded = next;
  listeners.forEach((l) => l());
}

/** Fetch the list for the current project, once at a time. A failed fetch leaves the list empty, so pages still render. */
async function load(): Promise<void> {
  const key = scopeKey();
  pending = key;
  const list = await apiFetch<TagList>(`./api/tags${tagScopeQuery()}`).catch(() => NO_TAGS);
  if (pending !== key) return;
  pending = null;
  set({ key, list, active: activeTags(list.tags) });
}

/** Fetch the list again, after a change. */
export const reloadTags = (): Promise<void> => load();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

onPrefChange(() => {
  if (loaded && loaded.key !== scopeKey()) void load();
});

/** The project's tags, and the ones that run, from one shared fetch; null while the first one loads. */
export function useTags(): { list: TagList; active: ActiveTag[] } | null {
  const has = useHost().has("tags");
  const snap = useSyncExternalStore(subscribe, () => loaded);
  useEffect(() => {
    if (has && pending === null && (!loaded || loaded.key !== scopeKey())) void load();
  }, [has, snap]);
  if (!has) return { list: NO_TAGS, active: [] };
  return snap && snap.key === scopeKey() ? snap : null;
}

/** The tags in hand right now, for code outside React (the browser's own search). */
export const currentTags = (): readonly TagRule[] => loaded?.list.tags ?? [];

const base = (id?: string) => `./api/tags${id ? `/${encodeURIComponent(id)}` : ""}${tagScopeQuery()}`;

/** Make a rule; the error message comes back from `act`. */
export const createTag = (t: TagInput) => apiSend<TagRule>("POST", base(), t).then((r) => (void reloadTags(), r));

export const updateTag = (id: string, t: Partial<TagInput>) => apiSend<TagRule>("PATCH", base(id), t).then((r) => (void reloadTags(), r));

export const setTagEnabled = (id: string, enabled: boolean) => apiSend<TagRule>("PATCH", base(id), { enabled }).then((r) => (void reloadTags(), r));

export const deleteTag = (id: string) => apiSend("DELETE", base(id)).then(() => void reloadTags());
