import Module from "node:module";
import { type EsmPatch, transformSource } from "./esm-source.js";

/** Called with a module's exports right after it ran. A returned value replaces the exports. */
export type OnLoad = (exports: unknown, file: string) => unknown;

interface CjsHook {
  pattern: RegExp;
  fn: OnLoad;
}

type ModuleLike = { exports: unknown };
type Compile = (this: ModuleLike, ...args: unknown[]) => unknown;
type Load = (request: string, ...rest: unknown[]) => unknown;
type SyncLoad = (url: string, context: unknown, next: (url: string, context: unknown) => LoadResult) => LoadResult;
interface LoadResult {
  format?: string | null;
  source?: unknown;
}
interface HookApi {
  registerHooks?: (hooks: { load: SyncLoad }) => unknown;
  register?: (specifier: string | URL, options?: { data?: unknown }) => void;
  _load: Load;
  prototype: { _compile: Compile };
}

const api = Module as unknown as HookApi;
const cjs: CjsHook[] = [];
const builtins = new Map<string, OnLoad>();
const esm: EsmPatch[] = [];

const report = (file: string, err: unknown) => console.warn(`[wizelens] Could not hook ${file}: ${String(err)}`);

function afterCompile(mod: ModuleLike, filename: string): void {
  const file = filename.replaceAll("\\", "/");
  for (const { pattern, fn } of cjs) {
    if (!pattern.test(file)) continue;
    try {
      const next = fn(mod.exports, file);
      if (next !== undefined) mod.exports = next;
    } catch (err) {
      report(file, err);
    }
  }
}

function runBuiltin(name: string): void {
  const fn = builtins.get(name);
  if (!fn) return;
  builtins.delete(name);
  try {
    fn(process.getBuiltinModule(`node:${name}`), `node:${name}`);
  } catch (err) {
    report(`node:${name}`, err);
  }
}

// Every CommonJS file runs through _compile, whether it was required or imported from ESM.
function hookCommonJs(): void {
  const compile = api.prototype._compile;
  api.prototype._compile = function wizelensCompile(this: ModuleLike, ...args: unknown[]) {
    const out = compile.apply(this, args);
    if (typeof args[1] === "string") afterCompile(this, args[1]);
    return out;
  };
  const load = api._load;
  api._load = function wizelensLoad(this: unknown, request: string, ...rest: unknown[]) {
    const out = load.call(this, request, ...rest);
    if (builtins.size > 0) runBuiltin(request.replace(/^node:/, ""));
    return out;
  };
}

const syncLoad: SyncLoad = (url, context, next) => {
  const result = next(url, context);
  if (url.startsWith("node:")) runBuiltin(url.slice(5));
  return transformSource(url, result, esm);
};

// ES modules have no exports object to patch, so a short line is added to their source instead.
function hookEsm(): void {
  if (api.registerHooks) api.registerHooks({ load: syncLoad });
  else api.register?.(new URL("./esm-loader.js", import.meta.url), { data: esm });
}

const ESM_KEY = Symbol.for("wizeworks.wizelens.auto.esm");
const bindings = new Map<string, (value: unknown) => unknown>();

function dispatchBinding(id: string, value: unknown): unknown {
  try {
    return bindings.get(id)?.(value);
  } catch (err) {
    report(id, err);
    return undefined;
  }
}

/** Install the module hooks. Call once, after every onLoad, onBuiltin, and onEsm call. */
export function installModuleHooks(): void {
  (globalThis as Record<symbol, unknown>)[ESM_KEY] = dispatchBinding;
  hookCommonJs();
  hookEsm();
}

/** Run `fn` with a binding an ES module patch hands over (see replaceBinding). A returned value replaces it. */
export const onEsmBinding = (id: string, fn: (value: unknown) => unknown): void => void bindings.set(id, fn);

/** Run `fn` with the exports of every CommonJS file whose path (forward slashes) matches. */
export const onLoad = (pattern: RegExp, fn: OnLoad): void => void cjs.push({ pattern, fn });

/** Run `fn` once with a built-in module ("sqlite"), when the app first loads it. */
export const onBuiltin = (name: string, fn: OnLoad): void => void builtins.set(name, fn);

/** Add `code` to the end of every ES module whose URL matches. */
export const onEsm = (patch: EsmPatch): void => void esm.push(patch);
