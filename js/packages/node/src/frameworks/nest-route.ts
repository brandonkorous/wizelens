// Nest's metadata keys (@nestjs/common constants) and its URI versioning type, so the add-on has no dependency on Nest.
const PATH_METADATA = "path";
const VERSION_METADATA = "__version__";
const VERSIONING_URI = 0;

type Target = object;

/** The parts of a Nest ExecutionContext the add-on reads. */
export interface NestContextLike {
  getClass(): Target & { name?: string };
  getHandler(): Target & { name?: string };
}

/** The parts of a Nest app the add-on reads: its global prefix and versioning. Both are private config, read when present. */
export interface NestConfigHolder {
  config?: {
    getGlobalPrefix?: () => string | undefined;
    getVersioning?: () => { type?: number; prefix?: string | false; defaultVersion?: unknown } | undefined;
  };
}

const metadata = (key: string, target: Target): unknown =>
  (Reflect as unknown as { getMetadata?: (k: string, t: Target) => unknown }).getMetadata?.(key, target);

const listOf = (value: unknown): string[] => {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((v): v is string => typeof v === "string");
};

const orRoot = (list: string[]): string[] => (list.length > 0 ? list : [""]);

/** Join route parts into "/a/b/:id", with no empty, double, or trailing slashes. */
export const joinRoute = (...parts: string[]): string => `/${parts.flatMap((p) => p.split("/")).filter(Boolean).join("/")}`;

/** True when a route template ("/orders/:id", "/files/*path", "/a{/:b}") matches a path. */
export function routeMatches(template: string, path: string): boolean {
  const pattern = template
    .replace(/[.+?^$()|[\]\\]/g, "\\$&")
    .replace(/\{/g, "(?:")
    .replace(/\}/g, ")?")
    .replace(/:\w+/g, "[^/]+")
    .replace(/\*\w*/g, ".*");
  return new RegExp(`^${pattern}/?$`).test(path);
}

/** The version this handler declares, else its controller's, as a list. A neutral version (a symbol) is no version. */
export function versionsOf(ctx: NestContextLike, fallback?: unknown): string[] {
  const declared = metadata(VERSION_METADATA, ctx.getHandler()) ?? metadata(VERSION_METADATA, ctx.getClass()) ?? fallback;
  return listOf(declared);
}

/** The URI version segments ("v1") a route can start with, or [""] when URI versioning is off. */
function uriVersions(ctx: NestContextLike, app: NestConfigHolder | undefined): string[] {
  const versioning = app?.config?.getVersioning?.();
  if (!versioning || versioning.type !== VERSIONING_URI) return [""];
  const prefix = versioning.prefix === false ? "" : (versioning.prefix ?? "v");
  return orRoot(versionsOf(ctx, versioning.defaultVersion).map((v) => `${prefix}${v}`));
}

/** Every route Nest could have registered this handler under: global prefix (or excluded), version, controller path, handler path. */
function candidates(ctx: NestContextLike, app: NestConfigHolder | undefined): string[] {
  const prefix = app?.config?.getGlobalPrefix?.() ?? "";
  const prefixes = prefix ? [prefix, ""] : [""];
  const versions = uriVersions(ctx, app);
  const controllers = orRoot(listOf(metadata(PATH_METADATA, ctx.getClass())));
  const handlers = orRoot(listOf(metadata(PATH_METADATA, ctx.getHandler())));
  const out: string[] = [];
  for (const p of prefixes) for (const v of versions) for (const c of controllers) for (const h of handlers) out.push(joinRoute(p, v, c, h));
  return out;
}

/** The route template of a Nest handler from its metadata, picked by the path it answered. Undefined when there is no metadata. */
export function nestRoute(ctx: NestContextLike, app: NestConfigHolder | undefined, path: string): string | undefined {
  if (metadata(PATH_METADATA, ctx.getHandler()) === undefined) return undefined;
  const all = candidates(ctx, app);
  return all.find((route) => routeMatches(route, path)) ?? all[0];
}
