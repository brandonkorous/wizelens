// Search from the dashboard: the host's `api/search` when it has one, else the traces the browser holds.
import { useEffect, useState } from "react";
import { activeTags, checkSearch, decodeCursor, expandTags, type SearchKind, type SearchPage, searchMemory, type Suggestion, suggestMemory, suggestTags, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import { apiFetch, ApiError } from "./api";
import { getScope } from "./prefs";
import { provider } from "./provider";
import { currentTags } from "./tags";

export interface SearchArgs {
  q: string;
  kind: SearchKind;
  range: TimeRange;
  limit: number;
}

export interface SearchAnswer extends SearchPage {
  tookMs?: number;
  settling?: number | null;
  /** Names after tag: that no tag rule has. */
  unknownTags?: string[];
}

/** Why a search gave nothing: a mistake in the search (with its position), or the host could not answer. */
export type SearchFailure = { type: "invalid"; message: string; start: number; end: number } | { type: "down"; message: string };

const scopeParams = (q: URLSearchParams) => {
  const scope = getScope();
  if (scope.project) q.set("project", scope.project);
  if (scope.env) q.set("env", scope.env);
  return q;
};

function localSearch(a: SearchArgs, cursor: string | null): SearchAnswer {
  const parsed = checkSearch(a.q);
  if (!parsed.ok) throw Object.assign(new Error(parsed.error), { start: parsed.start, end: parsed.end });
  const now = Date.now();
  const { node, unknownTags } = expandTags(parsed.node, activeTags(currentTags()));
  const page = searchMemory(provider.getSnapshot().traces, { kind: a.kind, node, window: { from: now - TIME_RANGES[a.range].ms, to: now }, limit: a.limit, cursor: decodeCursor(cursor) });
  return { ...page, unknownTags };
}

/** One page of results; `server` is the host's `search` capability. */
export async function runSearch(a: SearchArgs, cursor: string | null, server: boolean): Promise<SearchAnswer> {
  if (!server) return localSearch(a, cursor);
  const q = scopeParams(new URLSearchParams({ q: a.q, kind: a.kind, range: a.range, limit: String(a.limit) }));
  if (cursor) q.set("cursor", cursor);
  try {
    return await apiFetch<SearchAnswer>(`./api/search?${q.toString()}`);
  } catch (err) {
    // A 400 carries the error's position, so the box can mark the bad part; check it again here to get it.
    const local = err instanceof ApiError && err.status === 400 ? checkSearch(a.q) : null;
    throw local && !local.ok ? Object.assign(new Error(local.error), { start: local.start, end: local.end }) : err;
  }
}

/** The failure of a search call, told apart: a bad search, or a host that did not answer. */
export function failureOf(err: unknown): SearchFailure {
  const pos = err as { start?: number; end?: number };
  const message = err instanceof Error ? err.message : String(err);
  if (typeof pos.start === "number" && typeof pos.end === "number") return { type: "invalid", message, start: pos.start, end: pos.end };
  if (err instanceof ApiError && err.status === 400) return { type: "invalid", message, start: 0, end: 0 };
  return { type: "down", message };
}

/** Autocomplete for a field (or null for fields and keys) and a prefix. */
export async function fetchSuggest(field: string | null, prefix: string, range: TimeRange, server: boolean): Promise<Suggestion[]> {
  if (!server) {
    const now = Date.now();
    const r = { field, prefix, window: { from: now - TIME_RANGES[range].ms, to: now }, limit: 12 };
    return suggestTags(r, currentTags()) ?? suggestMemory(provider.getSnapshot().traces, r);
  }
  const q = scopeParams(new URLSearchParams({ prefix, range, limit: "12" }));
  if (field) q.set("field", field);
  return (await apiFetch<{ items: Suggestion[] }>(`./api/search/suggest?${q.toString()}`)).items;
}

export interface SearchState {
  pages: SearchAnswer[];
  loading: boolean;
  failure: SearchFailure | null;
  /** Ask for the page after the last one. */
  more: (() => void) | null;
}

/** Results for the arguments; pages add up as `more` is called. A new search starts over. */
export function useSearch(a: SearchArgs, server: boolean): SearchState {
  const key = JSON.stringify([a, server]);
  const [state, setState] = useState<{ key: string; pages: SearchAnswer[]; loading: boolean; failure: SearchFailure | null; cursor: string | null }>({ key: "", pages: [], loading: true, failure: null, cursor: null });
  const [want, setWant] = useState<{ key: string; cursor: string | null }>({ key, cursor: null });
  if (want.key !== key) setWant({ key, cursor: null });
  useEffect(() => {
    let live = true;
    const fresh = want.cursor === null;
    setState((s) => ({ ...s, key, loading: true, ...(fresh ? { pages: [], failure: null } : {}) }));
    runSearch(a, want.cursor, server)
      .then((page) => live && setState((s) => ({ key, pages: fresh ? [page] : [...s.pages, page], loading: false, failure: null, cursor: page.next })))
      .catch((err: unknown) => live && setState((s) => ({ ...s, key, loading: false, failure: failureOf(err) })));
    return () => void (live = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);
  const last = state.key === key ? state.pages[state.pages.length - 1] : undefined;
  const more = last?.next && !state.loading ? () => setWant({ key, cursor: last.next }) : null;
  return { pages: state.key === key ? state.pages : [], loading: state.loading || state.key !== key, failure: state.key === key ? state.failure : null, more };
}
