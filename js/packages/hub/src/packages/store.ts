// Where hosts keep the packages each service runs and the OSV answers about them. The hub keeps them in SQLite, the cloud in Postgres.
import type { PackageRef } from "@wizeworks/lens-core";

/** One package a service of a project runs. */
export interface ServicePackage extends PackageRef {
  service: string;
  firstMs: number;
  seenMs: number;
}

/** What an OSV advisory says, as kept. */
export interface Advisory {
  id: string;
  summary: string;
  /** OSV `database_specific.severity` (GitHub: LOW, MODERATE, HIGH, CRITICAL), upper case, or "" when none. */
  severity: string;
  aliases: string[];
  /** Fixed versions per package, `ecosystem|name` to the versions that fix it. */
  fixed: Record<string, string[]>;
  modifiedMs: number;
}

export interface PackageDb {
  /** Replace the set a service runs; packages it still runs keep their first seen time. */
  replace(project: string, service: string, packages: readonly PackageRef[], now: number): Promise<void>;
  list(project: string): Promise<ServicePackage[]>;
  /** Package versions any project runs whose check is missing or older than `before`, at most `limit`. */
  due(before: number, limit: number): Promise<PackageRef[]>;
  saveChecks(rows: readonly { pkg: PackageRef; vulns: string[] }[], now: number): Promise<void>;
  /** Advisory ids by `packageKey`, for the versions that were checked. */
  checks(pkgs: readonly PackageRef[]): Promise<Map<string, string[]>>;
  advisories(ids: readonly string[]): Promise<Map<string, Advisory>>;
  saveAdvisories(list: readonly Advisory[], now: number): Promise<void>;
  /** When the newest check ran, or null before the first. */
  lastCheck(): Promise<number | null>;
}
