import { ATTR_DB_FINGERPRINT } from "@wizeworks/lens-core/internal";
import { type DbSpan, runTraced, type StartDbSpan } from "../db.js";
import type { DbCallInfo, WizeLens } from "../types.js";
import { batchSizeOf, MONGO_CURSORS, MONGO_METHODS, mongoRows } from "./mongodb-shape.js";
import { clip, fingerprint, serverAttributes } from "./nosql.js";
import { dbSpansOf, patchMethod } from "./registry.js";

interface ClientLike {
  options?: { hosts?: { host?: string; port?: number }[] };
}

interface CollectionLike {
  collectionName?: string;
  dbName?: string;
  client?: ClientLike;
  s?: { namespace?: { db?: string; collection?: string }; db?: { client?: ClientLike; s?: { client?: ClientLike } } };
}

type ShapeOf = (args: readonly unknown[]) => string[];
type Bag = Record<string | symbol, unknown>;

const CURSOR_METHODS = ["toArray", "next", "tryNext", "hasNext", "forEach"];

/** The values a call ran with, for the fingerprint: its arguments, and the cursor's options set by chaining. */
const valuesOf = (args: readonly unknown[], cursor?: Bag) => [...args.filter((a) => typeof a !== "function"), cursor?.findOptions, cursor?.pipeline];

function callOf(coll: CollectionLike, method: string, shapeOf: ShapeOf, args: readonly unknown[], cursor?: Bag): { info: DbCallInfo; text: string } {
  const collection = coll.collectionName ?? coll.s?.namespace?.collection ?? "";
  const client = coll.client ?? coll.s?.db?.client ?? coll.s?.db?.s?.client;
  const host = client?.options?.hosts?.[0];
  const batch = batchSizeOf(method, args);
  const attributes: Record<string, string | number> = { ...serverAttributes(host?.host, host?.port), [ATTR_DB_FINGERPRINT]: fingerprint([method, ...valuesOf(args, cursor)]) };
  if (batch !== undefined) attributes["db.operation.batch.size"] = batch;
  const info: DbCallInfo = { system: "mongodb", adapter: "mongodb", operation: method, collection: collection || undefined, namespace: coll.dbName ?? coll.s?.namespace?.db, rowsOf: mongoRows, requireParent: true, attributes };
  return { info, text: clip([method, collection, ...shapeOf(args)].filter(Boolean).join(" ")) };
}

function wrapOnce(target: Bag, name: string, open: () => DbSpan | null): void {
  const original = target[name];
  if (typeof original !== "function") return;
  target[name] = function (this: unknown, ...args: unknown[]) {
    // forEach takes the per-document function last: it is not a done callback.
    const callArgs = name === "forEach" ? [] : args;
    return runTraced(open(), callArgs, (a) => (original as (...x: unknown[]) => unknown).apply(this, name === "forEach" ? args : a));
  };
}

/** One span per cursor, around its first fetch: the whole toArray, or the first next or for-await step. */
function traceCursor(cursor: Bag, open: () => DbSpan | null): void {
  let opened = false;
  const once = () => {
    if (opened) return null;
    opened = true;
    return open();
  };
  for (const name of CURSOR_METHODS) wrapOnce(cursor, name, once);
  const iterate = cursor[Symbol.asyncIterator];
  if (typeof iterate !== "function") return;
  cursor[Symbol.asyncIterator] = function (this: unknown) {
    const it = (iterate as () => Bag).call(this);
    wrapOnce(it, "next", once);
    return it;
  };
}

function traceMethods(proto: object, start: StartDbSpan): void {
  for (const [method, shapeOf] of Object.entries(MONGO_METHODS)) {
    patchMethod(proto, method, (original) =>
      function (this: CollectionLike, ...args: unknown[]) {
        const { info, text } = callOf(this, method, shapeOf, args);
        return runTraced(start(info, text, undefined), args, (a) => original.apply(this, a));
      },
    );
  }
}

function traceCursors(proto: object, start: StartDbSpan): void {
  for (const [method, shapeOf] of Object.entries(MONGO_CURSORS)) {
    patchMethod(proto, method, (original) =>
      function (this: CollectionLike, ...args: unknown[]) {
        const cursor = original.apply(this, args);
        if (typeof cursor !== "object" || cursor === null) return cursor;
        traceCursor(cursor as Bag, () => {
          const { info, text } = callOf(this, method, shapeOf, args, cursor as Bag);
          return start(info, text, undefined);
        });
        return cursor;
      },
    );
  }
}

type MongoTarget = { Collection?: { prototype?: object }; collectionName?: unknown; find?: unknown; collection?: (name: string) => unknown; db?: () => unknown; default?: unknown } | null;

/** The Collection prototype: from the module, a MongoClient, a Db, or a collection. Making a Db or collection object does no I/O. */
function prototypeOf(target: unknown): object | null {
  const t = target as MongoTarget;
  if (t?.Collection?.prototype) return t.Collection.prototype;
  if (t && typeof t.find === "function" && "collectionName" in t) return Object.getPrototypeOf(t) as object;
  if (typeof t?.collection === "function") return prototypeOf(t.collection("wizelens"));
  if (typeof t?.db === "function") return prototypeOf(t.db());
  return t?.default ? prototypeOf(t.default) : null;
}

/** Trace MongoDB collection calls (find, findOne, insert, update, delete, aggregate, count, bulkWrite...). Pass the `mongodb` module, a MongoClient, a Db, or a collection. Returns false when nothing was patched. */
export function instrumentMongoDb(wizelens: WizeLens, target: unknown): boolean {
  const start = dbSpansOf(wizelens);
  const proto = prototypeOf(target);
  if (!start || !proto) return false;
  traceMethods(proto, start);
  traceCursors(proto, start);
  return true;
}
