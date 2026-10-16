import { runTraced } from "../db.js";
import type { WizeLens } from "../types.js";
import { dbSpansOf, patchMethod } from "./registry.js";

interface DataSourceLike {
  options?: { type?: string; database?: unknown };
  driver?: { createQueryRunner?: (...args: unknown[]) => unknown };
}

const SYSTEMS: [RegExp, string][] = [
  [/postgres|cockroach/, "postgresql"],
  [/mariadb/, "mariadb"],
  [/mysql/, "mysql"],
  [/sqlite|sqljs|capacitor|cordova|expo|nativescript|react-native/, "sqlite"],
  [/mssql/, "microsoft.sql_server"],
  [/oracle/, "oracle.db"],
  [/spanner/, "gcp.spanner"],
  [/sap/, "sap.hana"],
];

const systemOf = (type: string | undefined): string => SYSTEMS.find(([re]) => re.test(type ?? ""))?.[1] ?? type ?? "unknown";

/** Rows of a TypeORM result: a row list, or a QueryResult with records / affected. */
function typeormRows(result: unknown): number | undefined {
  if (Array.isArray(result)) return result.length;
  const r = result as { records?: unknown[]; affected?: number } | null;
  return r?.records?.length ?? r?.affected ?? undefined;
}

function traceRunner(runner: object, info: { system: string; namespace: string | undefined }, start: NonNullable<ReturnType<typeof dbSpansOf>>): void {
  patchMethod(runner, "query", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const span = start({ ...info, adapter: "typeorm", rowsOf: typeormRows, outermost: true, requireParent: true }, String(args[0] ?? ""), args[1]);
      return runTraced(span, [], () => original.apply(this, args));
    },
  );
}

/** Trace every query a TypeORM DataSource runs (repositories, query builders, raw queries). Call after `initialize()` or before; both work. */
export function instrumentTypeOrm(wizelens: WizeLens, dataSource: unknown): boolean {
  const start = dbSpansOf(wizelens);
  const ds = dataSource as DataSourceLike | null;
  if (!start || typeof ds?.driver?.createQueryRunner !== "function") return false;
  const namespace = typeof ds.options?.database === "string" ? ds.options.database : undefined;
  const info = { system: systemOf(ds.options?.type), namespace };
  patchMethod(ds.driver, "createQueryRunner", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const runner = original.apply(this, args);
      if (runner && typeof runner === "object") traceRunner(runner, info, start);
      return runner;
    },
  );
  return true;
}
