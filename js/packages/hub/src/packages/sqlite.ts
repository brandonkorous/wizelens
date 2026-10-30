// The hub's package store, in its SQLite file.
import type { DatabaseSync } from "node:sqlite";
import { type PackageEcosystem, packageKey, type PackageRef } from "@wizeworks/lens-core/internal";
import type { Advisory, PackageDb, ServicePackage } from "./store.js";

interface Row {
  service: string;
  ecosystem: string;
  name: string;
  version: string;
  first_ms: number;
  seen_ms: number;
}

const refOf = (r: { ecosystem: string; name: string; version: string }): PackageRef => ({ ecosystem: r.ecosystem as PackageEcosystem, name: r.name, version: r.version });

function replace(db: DatabaseSync, project: string, service: string, packages: readonly PackageRef[], now: number): void {
  db.exec("BEGIN");
  try {
    db.prepare("CREATE TEMP TABLE IF NOT EXISTS keep_packages (ecosystem TEXT, name TEXT, version TEXT)").run();
    db.prepare("DELETE FROM keep_packages").run();
    const keep = db.prepare("INSERT INTO keep_packages VALUES (?, ?, ?)");
    const upsert = db.prepare(
      `INSERT INTO service_packages (project, service, ecosystem, name, version, first_ms, seen_ms) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (project, service, ecosystem, name, version) DO UPDATE SET seen_ms = excluded.seen_ms`,
    );
    for (const p of packages) (keep.run(p.ecosystem, p.name, p.version), upsert.run(project, service, p.ecosystem, p.name, p.version, now, now));
    db.prepare(
      `DELETE FROM service_packages WHERE project = ? AND service = ? AND NOT EXISTS
       (SELECT 1 FROM keep_packages k WHERE k.ecosystem = service_packages.ecosystem AND k.name = service_packages.name AND k.version = service_packages.version)`,
    ).run(project, service);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** The package store on the hub's database. */
export function sqlitePackages(db: DatabaseSync): PackageDb {
  return {
    replace: async (project, service, packages, now) => replace(db, project, service, packages, now),
    list: async (project) =>
      (db.prepare("SELECT service, ecosystem, name, version, first_ms, seen_ms FROM service_packages WHERE project = ? ORDER BY service, name").all(project) as unknown as Row[])
        .map((r): ServicePackage => ({ ...refOf(r), service: r.service, firstMs: r.first_ms, seenMs: r.seen_ms })),
    due: async (before, limit) =>
      (db.prepare(
        `SELECT DISTINCT p.ecosystem, p.name, p.version FROM service_packages p LEFT JOIN package_checks c
         ON c.ecosystem = p.ecosystem AND c.name = p.name AND c.version = p.version WHERE c.checked_ms IS NULL OR c.checked_ms < ? LIMIT ?`,
      ).all(before, limit) as unknown as Row[]).map(refOf),
    saveChecks: async (rows, now) => {
      const put = db.prepare("INSERT OR REPLACE INTO package_checks (ecosystem, name, version, vulns, checked_ms) VALUES (?, ?, ?, ?, ?)");
      for (const r of rows) put.run(r.pkg.ecosystem, r.pkg.name, r.pkg.version, JSON.stringify(r.vulns), now);
    },
    checks: async (pkgs) => {
      const get = db.prepare("SELECT vulns FROM package_checks WHERE ecosystem = ? AND name = ? AND version = ?");
      const out = new Map<string, string[]>();
      for (const p of pkgs) {
        const row = get.get(p.ecosystem, p.name, p.version) as { vulns: string } | undefined;
        if (row) out.set(packageKey(p), JSON.parse(row.vulns) as string[]);
      }
      return out;
    },
    advisories: async (ids) => {
      const get = db.prepare("SELECT json FROM advisories WHERE id = ?");
      return new Map(ids.flatMap((id) => {
        const row = get.get(id) as { json: string } | undefined;
        return row ? [[id, JSON.parse(row.json) as Advisory] as const] : [];
      }));
    },
    lastCheck: async () => (db.prepare("SELECT max(checked_ms) AS m FROM package_checks").get() as { m: number | null }).m,
    saveAdvisories: async (list, now) => {
      const put = db.prepare("INSERT OR REPLACE INTO advisories (id, json, fetched_ms) VALUES (?, ?, ?)");
      for (const a of list) put.run(a.id, JSON.stringify(a), now);
    },
  };
}
