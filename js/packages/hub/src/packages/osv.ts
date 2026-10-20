// The OSV API (osv.dev): which advisories touch a package version, and what one says. Only package names and versions are sent.
import type { PackageRef } from "@wizeworks/lens-core";
import type { Advisory } from "./store.js";

export const OSV_URL = "https://api.osv.dev";
/** Most queries in one querybatch call. */
export const OSV_BATCH = 1000;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

interface OsvAffected {
  package?: { ecosystem?: string; name?: string };
  ranges?: { events?: { fixed?: string }[] }[];
}

interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  modified?: string;
  database_specific?: { severity?: string };
  affected?: OsvAffected[];
}

/** An advisory as kept: its summary, severity, aliases, and the versions that fix it per package. */
export function advisoryOf(v: OsvVuln): Advisory {
  const fixed: Record<string, string[]> = {};
  for (const a of v.affected ?? []) {
    const key = `${a.package?.ecosystem ?? ""}|${a.package?.name ?? ""}`;
    const versions = (a.ranges ?? []).flatMap((r) => (r.events ?? []).flatMap((e) => (e.fixed ? [e.fixed] : [])));
    if (versions.length) fixed[key] = [...new Set([...(fixed[key] ?? []), ...versions])];
  }
  const summary = (v.summary ?? v.details ?? "").split("\n")[0]!.slice(0, 300);
  return { id: v.id, summary, severity: String(v.database_specific?.severity ?? "").toUpperCase(), aliases: v.aliases ?? [], fixed, modifiedMs: Date.parse(v.modified ?? "") || 0 };
}

/** The advisory ids of each package version, in order. Throws when OSV does not answer. */
export async function queryBatch(fetcher: Fetch, pkgs: readonly PackageRef[], base = OSV_URL): Promise<string[][]> {
  const queries = pkgs.map((p) => ({ package: { ecosystem: p.ecosystem, name: p.name }, version: p.version }));
  const res = await fetcher(`${base}/v1/querybatch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries }), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`OSV querybatch answered ${res.status}`);
  const body = (await res.json()) as { results?: { vulns?: { id: string }[] }[] };
  return pkgs.map((_, i) => (body.results?.[i]?.vulns ?? []).map((v) => v.id));
}

/** One advisory, or null when OSV does not know it. */
export async function fetchAdvisory(fetcher: Fetch, id: string, base = OSV_URL): Promise<Advisory | null> {
  const res = await fetcher(`${base}/v1/vulns/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OSV vulns answered ${res.status}`);
  return advisoryOf((await res.json()) as OsvVuln);
}
