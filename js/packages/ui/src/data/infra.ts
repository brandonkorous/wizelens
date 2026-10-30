import { useEffect, useMemo, useState } from "react";
import type { HostsModel, KubeModel } from "@wizeworks/lens-core/internal";
import { apiFetch } from "./api";
import { useHost, useRange } from "./host";
import { getScope } from "./prefs";
import { setProjectParams } from "./projectScope";

export type InfraPage = "hosts" | "kubernetes";
type ModelOfPage<P extends InfraPage> = P extends "hosts" ? HostsModel : KubeModel;

export interface InfraState<M> {
  model: M | null;
  loading: boolean;
  error: string | null;
  /** False when the host does not answer infrastructure pages (in-app add-ons). */
  supported: boolean;
}

const REFRESH_MS = 30_000;

function urlOf(page: InfraPage, params: Record<string, string>, range: string): string {
  const scope = getScope();
  const q = new URLSearchParams({ ...params, range });
  setProjectParams(q, scope);
  if (scope.env) q.set("env", scope.env);
  return `./api/models/${page}?${q.toString()}`;
}

/** The Hosts or Kubernetes page model from the hub or cloud, loaded again every 30 seconds. Empty values in `params` are left out. */
export function useInfraModel<P extends InfraPage>(page: P, params: Record<string, string | undefined>, enabled = true): InfraState<ModelOfPage<P>> {
  const supported = useHost().has("infra");
  const [range] = useRange();
  const clean = Object.fromEntries(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  const key = new URLSearchParams(clean).toString();
  const url = useMemo(() => (supported && enabled ? urlOf(page, Object.fromEntries(new URLSearchParams(key)), range) : null), [supported, enabled, page, key, range]);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ model: ModelOfPage<P> | null; url: string | null; error: string | null }>({ model: null, url: null, error: null });
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!url) return;
    let live = true;
    apiFetch<ModelOfPage<P>>(url)
      .then((model) => live && setState({ model, url, error: null }))
      .catch((err: unknown) => live && setState((s) => ({ ...s, url, error: err instanceof Error ? err.message : String(err) })));
    return () => void (live = false);
  }, [url, tick]);
  const fresh = state.url === url;
  return { model: state.model, loading: !!url && !fresh && !state.error, error: state.error, supported };
}
