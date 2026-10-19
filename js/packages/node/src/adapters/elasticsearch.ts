import { ATTR_DB_FINGERPRINT } from "@wizeworks/lens-core";
import type { StartDbSpan } from "../db.js";
import type { DbCallInfo, WizeLens } from "../types.js";
import { fingerprint, isIdLike, runChecked, serverAttributes } from "./nosql.js";
import { dbSpansOf, patchMethod } from "./registry.js";

interface EsRequest {
  method?: string;
  path?: string;
  body?: unknown;
  bulkBody?: unknown;
  querystring?: unknown;
  meta?: { name?: string };
}

interface TransportLike {
  connectionPool?: { connections?: { url?: URL }[] };
}

interface EsBody {
  hits?: { hits?: unknown[] };
  items?: unknown[];
  docs?: unknown[];
  responses?: unknown[];
  deleted?: number;
  updated?: number;
  errors?: boolean;
}

// After these, the next path part is a document id.
const DOC_APIS = new Set(["_doc", "_create", "_update", "_source", "_explain", "_termvectors"]);
const BULK_ACTIONS = new Set(["index", "create", "update", "delete"]);

const partsOf = (path: string | undefined): string[] => (path ?? "/").split("?")[0]!.split("/");

/** The path with ids as `?` and no query string: "/orders/_doc/?" for "/orders/_doc/42". Numbers in the index name are `?` too. */
export function esPathShape(path: string | undefined): string {
  const parts = partsOf(path);
  const shaped = parts.map((part, i) => {
    if (part === "" || part.startsWith("_")) return part;
    if (i === 1) return part.replace(/\d+/g, "?");
    return DOC_APIS.has(parts[i - 1]!) || isIdLike(part) ? "?" : part;
  });
  return shaped.join("/") || "/";
}

const DOC_OPS: Record<string, string> = { GET: "get", HEAD: "exists", DELETE: "delete" };
const INDEX_OPS: Record<string, string> = { PUT: "indices.create", DELETE: "indices.delete", HEAD: "indices.exists" };

/** The API name: the client's own (search, index, bulk...), else read from the method and path. */
export function esOperation(req: EsRequest): string {
  if (req.meta?.name) return req.meta.name;
  const method = (req.method ?? "GET").toUpperCase();
  const parts = partsOf(req.path).filter(Boolean);
  const api = parts.findLast((p) => p.startsWith("_"));
  if (api === "_doc") return DOC_OPS[method] ?? "index";
  if (api) return api.slice(1);
  return parts.length === 0 ? "info" : (INDEX_OPS[method] ?? "indices.get");
}

const bodyOf = (result: unknown): EsBody | null => {
  const r = result as { body?: unknown; statusCode?: unknown } | null;
  return (r && typeof r === "object" && "statusCode" in r && "body" in r ? r.body : r) as EsBody | null;
};

/** Rows of a response: search hits, bulk items, mget docs, msearch responses, or documents changed by query. */
export function esRows(result: unknown): number | undefined {
  const b = bodyOf(result);
  if (!b || typeof b !== "object") return undefined;
  return b.hits?.hits?.length ?? b.items?.length ?? b.docs?.length ?? b.responses?.length ?? b.deleted ?? b.updated;
}

const bulkError = (result: unknown) => (bodyOf(result)?.errors === true ? new Error("Elasticsearch bulk request had failed items") : undefined);

const isAction = (line: unknown): boolean => typeof line === "object" && line !== null && Object.keys(line).length === 1 && BULK_ACTIONS.has(Object.keys(line)[0]!);

function callOf(transport: TransportLike, req: EsRequest): { info: DbCallInfo; text: string } {
  const method = (req.method ?? "GET").toUpperCase();
  const first = partsOf(req.path)[1];
  const index = first && !first.startsWith("_") ? first : undefined;
  const url = transport.connectionPool?.connections?.[0]?.url;
  const body = req.body ?? req.bulkBody;
  const attributes: Record<string, string | number> = { ...serverAttributes(url?.hostname, url?.port), [ATTR_DB_FINGERPRINT]: fingerprint([method, req.path, req.querystring, body]) };
  if (Array.isArray(body) && body.some(isAction)) attributes["db.operation.batch.size"] = body.filter(isAction).length;
  const info: DbCallInfo = { system: "elasticsearch", adapter: "elasticsearch", operation: esOperation(req), namespace: index, collection: index, rowsOf: esRows, requireParent: true, attributes };
  return { info, text: `${method} ${esPathShape(req.path)}` };
}

function traceRequest(proto: object, start: StartDbSpan): void {
  patchMethod(proto, "request", (original) =>
    function (this: TransportLike, ...args: unknown[]) {
      const req = args[0] as EsRequest | undefined;
      if (!req || typeof req.path !== "string") return original.apply(this, args);
      const { info, text } = callOf(this, req);
      return runChecked(start(info, text, undefined), args, (a) => original.apply(this, a), bulkError);
    },
  );
}

type EsTarget = { prototype?: { request?: unknown }; Transport?: unknown; SniffingTransport?: unknown; default?: unknown; transport?: unknown; request?: unknown; connectionPool?: unknown } | null;

/** Transport prototypes: from the client module, the transport module, a Client, or a transport. */
function prototypesOf(target: unknown, depth = 0): object[] {
  const t = target as EsTarget;
  if (!t || depth > 3) return [];
  if (typeof target === "function") return typeof t.prototype?.request === "function" ? [t.prototype] : [];
  const fromModule = [t.Transport, t.SniffingTransport, t.default].flatMap((m) => prototypesOf(m, depth + 1));
  if (fromModule.length > 0) return fromModule;
  if (t.transport) return prototypesOf(t.transport, depth + 1);
  return typeof t.request === "function" && t.connectionPool ? [Object.getPrototypeOf(t) as object] : [];
}

/** Trace every Elasticsearch request (v8 client; v7 works too). Pass `@elastic/elasticsearch`, `@elastic/transport`, or a Client. Returns false when nothing was patched. */
export function instrumentElasticsearch(wizelens: WizeLens, target: unknown): boolean {
  const start = dbSpansOf(wizelens);
  const protos = prototypesOf(target);
  if (!start || protos.length === 0) return false;
  for (const proto of protos) traceRequest(proto, start);
  return true;
}
