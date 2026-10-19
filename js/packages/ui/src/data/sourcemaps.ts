import { useEffect, useState } from "react";
import { cachedLoader, type ErrorEvent, fetchMapLoader, type ResolvedFrame, resolveStack, SOURCEMAPS_RESOLVE_PATH } from "@wizeworks/lens-core";
import { apiSend } from "./api";
import { useHost } from "./host";
import { getScope } from "./prefs";

/** What a stack view needs from an error: an ErrorEvent, or one built from a trace span. */
export type StackSource = Pick<ErrorEvent, "type" | "message" | "stack" | "browser" | "release">;

export interface ResolvedStack {
  frames: ResolvedFrame[] | null;
  loading: boolean;
  error: string | null;
}

// Hosts without the resolve API (the .NET add-on): this browser reads the maps the dev server or the site serves.
const browserLoader = cachedLoader(fetchMapLoader({ allow: (u) => /^https?:$/.test(u.protocol), timeoutMs: 8000 }), { max: 10, hitMs: 30_000 });

function resolveUrl(): string {
  const project = getScope().project;
  return `./${SOURCEMAPS_RESOLVE_PATH}${project ? `?project=${encodeURIComponent(project)}` : ""}`;
}

async function resolveOn(server: boolean, stack: string, release: string | null): Promise<ResolvedFrame[]> {
  if (!server) return resolveStack(stack, release, browserLoader);
  return (await apiSend<{ frames: ResolvedFrame[] }>("POST", resolveUrl(), { stack, release })).frames;
}

/** A browser error's stack after source maps, from the host when it resolves stacks, else in this browser. Null frames for server errors. */
export function useResolvedStack(event: StackSource): ResolvedStack {
  const server = useHost().has("sourcemaps");
  const stack = event.browser ? event.stack : null;
  const [state, setState] = useState<ResolvedStack & { key: string | null }>({ key: null, frames: null, loading: false, error: null });
  const key = stack ? `${server}\n${event.release ?? ""}\n${stack}` : null;
  useEffect(() => {
    if (!stack || !key) return;
    let live = true;
    resolveOn(server, stack, event.release)
      .then((frames) => live && setState({ key, frames, loading: false, error: null }))
      .catch((err: unknown) => live && setState({ key, frames: null, loading: false, error: err instanceof Error ? err.message : String(err) }));
    return () => void (live = false);
  }, [key, server, stack, event.release]);
  if (!key) return { frames: null, loading: false, error: null };
  return state.key === key ? state : { frames: null, loading: true, error: null };
}
