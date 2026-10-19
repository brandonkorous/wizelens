// One service's numbers: a need with `service` reads the per-service kind, and its keys come back without the service.
import { joinKey, SERVICE_KIND } from "./kinds.js";
import type { KeyFilter, Need, NeedResults } from "./needs.js";

/** The filter on the per-service kind: the service first, then the need's own filter. */
function scopedFilter(service: string, f: KeyFilter | undefined): KeyFilter {
  return {
    prefix: joinKey(service, f?.prefix ?? ""),
    ...(f?.keys ? { keys: f.keys.map((k) => joinKey(service, k)) } : {}),
    ...(f?.parts ? { parts: [service, ...f.parts] } : {}),
  };
}

/** The need as executors know it: a `service` need reads its kind's per-service copy. */
export function scopeNeed(n: Need): Need {
  if ((n.type !== "groups" && n.type !== "series") || n.service === undefined) return n;
  const kind = SERVICE_KIND[n.kind];
  if (!kind) throw new Error(`${n.kind} has no per-service kind`);
  const { service, ...rest } = n;
  return { ...rest, kind, filter: scopedFilter(service, n.filter) } as Need;
}

const strip = (service: string) => {
  const head = joinKey(service, "");
  return (key: string) => (key.startsWith(head) ? key.slice(head.length) : key);
};

/** Results with the service taken off the keys of `service` needs, so models read them like any other. */
export function unscopeResults(r: NeedResults, needs: readonly Need[]): NeedResults {
  const groups = { ...r.groups };
  const series = { ...r.series };
  for (const n of needs) {
    if (n.type === "groups" && n.service !== undefined && groups[n.id]) {
      const cut = strip(n.service);
      groups[n.id] = { ...groups[n.id]!, rows: groups[n.id]!.rows.map((row) => ({ ...row, key: cut(row.key) })) };
    }
    if (n.type === "series" && n.service !== undefined && series[n.id]) {
      const cut = strip(n.service);
      series[n.id] = { byKey: Object.fromEntries(Object.entries(series[n.id]!.byKey).map(([k, v]) => [n.split ? cut(k) : k, v])) };
    }
  }
  return { ...r, groups, series };
}
