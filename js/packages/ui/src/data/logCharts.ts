import { useCallback, useState } from "react";
import { logSearchHref, logSearchOf, type SavedItem } from "@wizeworks/lens-core";
import { changeSaved, useSavedApi, useSavedItems } from "./saved";

/** A saved log search drawn as a chart on the Logs page. */
export interface LogChart {
  item: SavedItem;
  params: Record<string, string>;
}

export interface LogCharts {
  charts: LogChart[];
  error: string | null;
  /** The host keeps them (a saved search per chart); false: this browser keeps them. */
  server: boolean;
  /** Whether this person may add and delete charts here. */
  canWrite: boolean;
  /** Save the filters as a charted search; the error message, or null. */
  save: (name: string, params: Record<string, string>, shared: boolean) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
}

const STORE_KEY = "wizelens.ui.logSearches";

/** Old browser entries kept `params`, not an address. */
type Stored = Partial<SavedItem> & { params?: Record<string, string> };

const itemOf = (s: Stored): SavedItem => ({
  id: s.id ?? crypto.randomUUID(),
  projectId: "",
  kind: "search",
  name: s.name ?? "",
  href: s.href ?? logSearchHref(s.params ?? {}),
  panels: [],
  chart: true,
  shared: false,
  owner: "",
  ownerName: "",
  createdMs: s.createdMs ?? Date.now(),
  updatedMs: s.updatedMs ?? s.createdMs ?? Date.now(),
});

function readLocal(): SavedItem[] {
  try {
    return (JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as Stored[]).map(itemOf);
  } catch {
    return [];
  }
}

function writeLocal(list: SavedItem[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: the charts last for this page only.
  }
}

const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

const chartsOf = (items: SavedItem[]): LogChart[] =>
  items.flatMap((item) => {
    const params = item.chart ? logSearchOf(item.href) : null;
    return params ? [{ item, params }] : [];
  });

/** Log searches charted on the Logs page: saved searches on hosts that keep them (hub, cloud), else in this browser. */
export function useLogCharts(): LogCharts {
  const api = useSavedApi();
  const { items, error } = useSavedItems("search");
  const [local, setLocal] = useState<SavedItem[]>(readLocal);
  const run = useCallback(async (change: () => unknown) => {
    try {
      await change();
      return null;
    } catch (e) {
      return errorOf(e);
    }
  }, []);
  const keepLocal = (list: SavedItem[]) => (writeLocal(list), setLocal(list));
  const save = (name: string, params: Record<string, string>, shared: boolean) =>
    run(() =>
      api.on
        ? changeSaved(api.url(), "POST", { kind: "search", name: name.trim(), href: logSearchHref(params), chart: true, shared: !api.cloud || shared })
        : keepLocal([...readLocal(), itemOf({ name: name.trim(), params })]),
    );
  const owner = (id: string) => items.find((i) => i.id === id)?.projectId || undefined;
  const remove = (id: string) => run(() => (api.on ? changeSaved(api.url(`/${encodeURIComponent(id)}`, owner(id)), "DELETE") : keepLocal(readLocal().filter((s) => s.id !== id))));
  return { charts: chartsOf(api.on ? items : local), error: api.on ? error : null, server: api.on, canWrite: !api.on || api.canWrite, save, remove };
}
