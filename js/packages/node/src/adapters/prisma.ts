import { runTraced } from "../db.js";
import type { WizeLens } from "../types.js";
import { dbSpansOf } from "./registry.js";

export interface PrismaOptions {
  /** OTel `db.system.name` of your datasource, for example "postgresql". Default "prisma". */
  system?: string;
  /** Database name for `db.namespace`. */
  namespace?: string;
}

interface OperationCall {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

const VERBS: [RegExp, string][] = [
  [/^(find|count|aggregate|groupBy)/, "SELECT"],
  [/^create/, "INSERT"],
  [/^upsert/, "UPSERT"],
  [/^update/, "UPDATE"],
  [/^delete/, "DELETE"],
];

const verbOf = (operation: string): string => VERBS.find(([re]) => re.test(operation))?.[1] ?? operation.toUpperCase();

/** SQL text and values of a raw call: $queryRaw (Prisma.Sql) or $queryRawUnsafe(sql, ...values). */
function rawQuery(args: unknown): { sql: string; values: unknown } {
  if (Array.isArray(args) && typeof args[0] === "string") return { sql: args[0], values: args.slice(1) };
  const sql = args as { sql?: string; strings?: string[]; values?: unknown[] } | null;
  if (typeof sql?.sql === "string") return { sql: sql.sql, values: sql.values };
  if (Array.isArray(sql?.strings)) return { sql: sql.strings.join("?"), values: sql.values };
  return { sql: "raw query", values: undefined };
}

function prismaRows(result: unknown): number | undefined {
  if (Array.isArray(result)) return result.length;
  if (typeof result === "number") return result;
  const r = result as { count?: number } | null;
  return typeof r?.count === "number" ? r.count : undefined;
}

/** A Prisma Client extension that traces every model and raw operation: `prisma.$extends(prismaExtension(wizelens))`. */
export function prismaExtension(wizelens: WizeLens, options: PrismaOptions = {}) {
  const start = dbSpansOf(wizelens);
  const system = options.system ?? "prisma";
  return {
    name: "wizelens",
    query: {
      $allOperations({ model, operation, args, query }: OperationCall): Promise<unknown> {
        if (!start) return query(args);
        const raw = !model;
        const { sql, values } = raw ? rawQuery(args) : { sql: `prisma.${model}.${operation}`, values: args };
        const info = { system, adapter: "prisma", namespace: options.namespace, collection: model, operation: raw ? undefined : verbOf(operation), rowsOf: prismaRows, outermost: true, requireParent: true };
        return runTraced(start(info, sql, values), [], () => query(args)) as Promise<unknown>;
      },
    },
  };
}
