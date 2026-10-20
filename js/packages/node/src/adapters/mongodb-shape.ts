const MAX_DEPTH = 6;
const MAX_FIELDS = 30;
const MAX_ITEMS = 20;

function isPlain(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || "_bsontype" in value) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** A field path with array indexes and id-like parts as `?`: "items.0.qty" is "items.?.qty". */
export const fieldShape = (field: string): string =>
  field
    .split(".")
    .map((part) => (/^\d+$/.test(part) || part.length >= 24 ? "?" : part))
    .join(".");

/** A filter, update, or pipeline with every value as `?`: {"status":?,"total":{"$gt":?}}. Lists of values are one `?`. */
export function docShape(value: unknown, depth = 0): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (!value.every(isPlain)) return "?";
    return `[${[...new Set(value.slice(0, MAX_ITEMS).map((v) => docShape(v, depth + 1)))].join(",")}]`;
  }
  if (!isPlain(value)) return "?";
  if (depth >= MAX_DEPTH) return "{…}";
  const keys = Object.keys(value);
  const fields = keys.slice(0, MAX_FIELDS).map((k) => `${JSON.stringify(fieldShape(k))}:${docShape(value[k], depth + 1)}`);
  if (keys.length > MAX_FIELDS) fields.push("…");
  return `{${fields.join(",")}}`;
}

/** The shapes a method's arguments show in the query text. */
type ShapeOf = (args: readonly unknown[]) => string[];

const filter: ShapeOf = (a) => [docShape(a[0] ?? {})];
const filterAndUpdate: ShapeOf = (a) => [docShape(a[0] ?? {}), docShape(a[1])];
const pipeline: ShapeOf = (a) => [docShape(a[0] ?? [])];
const none: ShapeOf = () => [];
const distinct: ShapeOf = (a) => [typeof a[0] === "string" ? fieldShape(a[0]) : "?", docShape(a[1] ?? {})];

/** Collection methods that run at once. Inserted documents and replacements are never shown. */
export const MONGO_METHODS: Readonly<Record<string, ShapeOf>> = {
  findOne: filter,
  countDocuments: filter,
  count: filter,
  deleteOne: filter,
  deleteMany: filter,
  findOneAndDelete: filter,
  replaceOne: filter,
  findOneAndReplace: filter,
  updateOne: filterAndUpdate,
  updateMany: filterAndUpdate,
  findOneAndUpdate: filterAndUpdate,
  insertOne: none,
  insertMany: none,
  bulkWrite: none,
  estimatedDocumentCount: none,
  distinct,
  createIndex: filter,
  drop: none,
};

/** Collection methods that return a cursor: the span starts when the cursor first fetches. */
export const MONGO_CURSORS: Readonly<Record<string, ShapeOf>> = { find: filter, aggregate: pipeline };

const COUNTS = ["insertedCount", "modifiedCount", "upsertedCount", "deletedCount"] as const;

/** Rows of a result: documents in a list, the write counts, or 1 / 0 for one document. Plain counts are not rows. */
export function mongoRows(result: unknown): number | undefined {
  if (Array.isArray(result)) return result.length;
  if (result === null) return 0;
  if (typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  const counts = COUNTS.map((k) => r[k]).filter((v): v is number => typeof v === "number");
  if (counts.length > 0) return counts.reduce((t, n) => t + n, 0);
  if ("ok" in r && "value" in r) return r.value ? 1 : 0;
  return 1;
}

/** Operations in a bulkWrite, for `db.operation.batch.size`. */
export const batchSizeOf = (method: string, args: readonly unknown[]): number | undefined => (method === "bulkWrite" && Array.isArray(args[0]) ? args[0].length : undefined);
