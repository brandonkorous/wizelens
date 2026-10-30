// The known-vulnerability check: package versions not checked for a day go to OSV, and new advisories are fetched once.
import { advisorySeverity, packageKey, type PackageRef, type PackageRisk, type PackageScan } from "@wizeworks/lens-core/internal";
import { type Fetch, fetchAdvisory, OSV_BATCH, OSV_URL, queryBatch } from "./osv.js";
import type { Advisory, PackageDb, ServicePackage } from "./store.js";

export const CHECK_EVERY_MS = 86_400_000;
/** Most new advisories fetched in one round; the rest wait for the next. */
const ADVISORIES_PER_ROUND = 200;

export interface CheckResult {
  checked: number;
  advisories: number;
}

/** One round: re-check what is due, then fetch the advisories not kept yet. */
export async function checkPackages(db: PackageDb, fetcher: Fetch, now: number, base = OSV_URL): Promise<CheckResult> {
  const due = await db.due(now - CHECK_EVERY_MS, OSV_BATCH);
  if (due.length === 0) return { checked: 0, advisories: 0 };
  const ids = await queryBatch(fetcher, due, base);
  await db.saveChecks(due.map((pkg, i) => ({ pkg, vulns: ids[i]! })), now);
  const all = [...new Set(ids.flat())];
  const kept = await db.advisories(all);
  const missing = all.filter((id) => !kept.has(id)).slice(0, ADVISORIES_PER_ROUND);
  const fetched: Advisory[] = [];
  for (const id of missing) {
    const a = await fetchAdvisory(fetcher, id, base);
    if (a) fetched.push(a);
  }
  await db.saveAdvisories(fetched, now);
  return { checked: due.length, advisories: fetched.length };
}

const versionKey = (p: PackageRef): string => packageKey(p);

/** A project's package versions, each with the services that run it and its advisories (empty when none, or not checked yet). */
export async function packageRisks(db: PackageDb, project: string): Promise<{ risks: PackageRisk[]; scan: PackageScan }> {
  const rows = await db.list(project);
  const byVersion = new Map<string, { pkg: ServicePackage; services: Set<string>; first: number; last: number }>();
  for (const r of rows) {
    const e = byVersion.get(versionKey(r)) ?? { pkg: r, services: new Set<string>(), first: r.firstMs, last: r.seenMs };
    e.services.add(r.service);
    byVersion.set(versionKey(r), { ...e, first: Math.min(e.first, r.firstMs), last: Math.max(e.last, r.seenMs) });
  }
  const pkgs = [...byVersion.values()].map((e) => e.pkg);
  const checks = await db.checks(pkgs);
  const advisories = await db.advisories([...new Set([...checks.values()].flat())]);
  const risks = [...byVersion.values()].map(({ pkg, services, first, last }): PackageRisk => {
    const found = (checks.get(versionKey(pkg)) ?? []).flatMap((id) => (advisories.has(id) ? [advisories.get(id)!] : []));
    const advs = found.map((a) => ({ id: a.id, summary: a.summary, severity: advisorySeverity(a.severity), aliases: a.aliases, fixed: a.fixed[`${pkg.ecosystem}|${pkg.name}`] ?? [], url: `https://osv.dev/vulnerability/${a.id}` }));
    return { ecosystem: pkg.ecosystem, name: pkg.name, version: pkg.version, services: [...services].sort(), advisories: advs, firstSeenMs: first, lastSeenMs: last };
  });
  return { risks, scan: { packages: byVersion.size, services: new Set(rows.map((r) => r.service)).size, checkedMs: checks.size ? await db.lastCheck() : null } };
}
