// The cloud's package store, in Postgres: each project's services and their packages, and OSV answers shared by all projects.
import { type PackageEcosystem, packageKey, type PackageRef } from "@wizeworks/lens-core/internal";
import type { Advisory, PackageDb, ServicePackage } from "@wizeworks/lens-hub/internal";
import type { Db } from "../db/db.js";

interface Row {
  service: string;
  ecosystem: string;
  name: string;
  version: string;
  first_ms: number;
  seen_ms: number;
}

const refOf = (r: { ecosystem: string; name: string; version: string }): PackageRef => ({ ecosystem: r.ecosystem as PackageEcosystem, name: r.name, version: r.version });

async function replace(db: Db, project: string, service: string, packages: readonly PackageRef[], now: number): Promise<void> {
  await db.tx(async (q) => {
    const keep = new Set(packages.map(packageKey));
    const old = await q.query<Row>("SELECT ecosystem, name, version FROM service_packages WHERE project_id = $1 AND service = $2", [project, service]);
    for (const r of old) if (!keep.has(packageKey(refOf(r)))) await q.query("DELETE FROM service_packages WHERE project_id = $1 AND service = $2 AND ecosystem = $3 AND name = $4 AND version = $5", [project, service, r.ecosystem, r.name, r.version]);
    for (const p of packages) {
      await q.query(
        `INSERT INTO service_packages (project_id, service, ecosystem, name, version, first_ms, seen_ms) VALUES ($1, $2, $3, $4, $5, $6, $6)
         ON CONFLICT (project_id, service, ecosystem, name, version) DO UPDATE SET seen_ms = EXCLUDED.seen_ms`,
        [project, service, p.ecosystem, p.name, p.version, now],
      );
    }
  });
}

async function checks(db: Db, pkgs: readonly PackageRef[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const p of pkgs) {
    const [row] = await db.query<{ vulns: string }>("SELECT vulns FROM package_checks WHERE ecosystem = $1 AND name = $2 AND version = $3", [p.ecosystem, p.name, p.version]);
    if (row) out.set(packageKey(p), JSON.parse(row.vulns) as string[]);
  }
  return out;
}

/** The package store on the cloud database. */
export function pgPackages(db: Db): PackageDb {
  return {
    replace: (project, service, packages, now) => replace(db, project, service, packages, now),
    list: async (project) =>
      (await db.query<Row>("SELECT service, ecosystem, name, version, first_ms, seen_ms FROM service_packages WHERE project_id = $1 ORDER BY service, name", [project]))
        .map((r): ServicePackage => ({ ...refOf(r), service: r.service, firstMs: Number(r.first_ms), seenMs: Number(r.seen_ms) })),
    due: async (before, limit) =>
      (await db.query<Row>(
        `SELECT DISTINCT p.ecosystem, p.name, p.version FROM service_packages p LEFT JOIN package_checks c
         ON c.ecosystem = p.ecosystem AND c.name = p.name AND c.version = p.version WHERE c.checked_ms IS NULL OR c.checked_ms < $1 LIMIT $2`,
        [before, limit],
      )).map(refOf),
    saveChecks: async (rows, now) => {
      for (const r of rows) {
        await db.query(
          `INSERT INTO package_checks (ecosystem, name, version, vulns, checked_ms) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (ecosystem, name, version) DO UPDATE SET vulns = EXCLUDED.vulns, checked_ms = EXCLUDED.checked_ms`,
          [r.pkg.ecosystem, r.pkg.name, r.pkg.version, JSON.stringify(r.vulns), now],
        );
      }
    },
    checks: (pkgs) => checks(db, pkgs),
    advisories: async (ids) => {
      if (ids.length === 0) return new Map();
      const rows = await db.query<{ id: string; json: string }>("SELECT id, json FROM advisories WHERE id = ANY($1)", [[...ids]]);
      return new Map(rows.map((r) => [r.id, JSON.parse(r.json) as Advisory]));
    },
    lastCheck: async () => {
      const [row] = await db.query<{ m: number | null }>("SELECT max(checked_ms) AS m FROM package_checks");
      return row?.m == null ? null : Number(row.m);
    },
    saveAdvisories: async (list, now) => {
      for (const a of list) {
        await db.query("INSERT INTO advisories (id, json, fetched_ms) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET json = EXCLUDED.json, fetched_ms = EXCLUDED.fetched_ms", [a.id, JSON.stringify(a), now]);
      }
    },
  };
}
