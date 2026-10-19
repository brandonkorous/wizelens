import { runTraced, type StartDbSpan } from "../db.js";
import type { WizeLens } from "../types.js";
import { ownerOf, runChecked } from "./nosql.js";
import { batchCall, commandCall, type RedisCommand, type RedisConn, replyError } from "./redis-shape.js";
import { dbSpansOf, patchMethod } from "./registry.js";

interface NodeRedisLike {
  options?: { url?: string; database?: number; socket?: { host?: string; port?: number; path?: string } };
}

interface CommandDef {
  transformArguments?: (...args: unknown[]) => unknown;
  SHA1?: string;
  NUMBER_OF_KEYS?: number;
}

type Method = (original: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown;

function urlParts(url: string | undefined): { host?: string; port?: number; db?: string } {
  if (!url) return {};
  try {
    const u = new URL(url);
    return { host: u.hostname || undefined, port: u.port ? Number(u.port) : undefined, db: u.pathname.slice(1) || undefined };
  } catch {
    return {};
  }
}

function connOf(client: NodeRedisLike): RedisConn {
  const o = client.options ?? {};
  const url = urlParts(o.url);
  if (o.socket?.path) return { namespace: String(o.database ?? url.db ?? 0) };
  return { namespace: String(o.database ?? url.db ?? 0), host: o.socket?.host ?? url.host ?? "localhost", port: o.socket?.port ?? url.port ?? 6379 };
}

const toCommand = (raw: readonly unknown[]): RedisCommand => ({ name: String(raw[0] ?? ""), args: raw.slice(1) });

// v4 typed commands may start with commandOptions(), an object keyed by a symbol.
const isOptions = (v: unknown): boolean => typeof v === "object" && v !== null && !Array.isArray(v) && Object.getOwnPropertySymbols(v).length > 0;

/** The raw arguments ("GET", key) of a v4 typed command, built the way the client builds them. */
function rawOf(command: CommandDef | undefined, args: unknown): unknown[] | null {
  if (typeof command?.transformArguments !== "function" || !Array.isArray(args)) return null;
  try {
    const out = command.transformArguments(...(isOptions(args[0]) ? args.slice(1) : args));
    return Array.isArray(out) && out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** Wrap a method whose call is one command, given its raw arguments. */
function oneCommand(start: StartDbSpan, rawArgs: (args: unknown[]) => unknown[] | null): Method {
  return (original) =>
    function (this: NodeRedisLike, ...args: unknown[]) {
      const raw = rawArgs(args);
      if (!raw) return original.apply(this, args);
      const { info, text } = commandCall("redis", toCommand(raw), connOf(this));
      return runTraced(start(info, text, undefined), [], () => original.apply(this, args));
    };
}

/** Wrap a method that runs queued commands as one MULTI or pipeline. */
function batch(start: StartDbSpan, kindOf: (args: unknown[]) => "MULTI" | "PIPELINE"): Method {
  return (original) =>
    function (this: NodeRedisLike, ...args: unknown[]) {
      const queue = args[0];
      if (!Array.isArray(queue) || queue.length === 0) return original.apply(this, args);
      const cmds = queue.map((c: { args?: unknown }) => toCommand(Array.isArray(c?.args) ? c.args : []));
      const { info, text } = batchCall("redis", kindOf(args), cmds, connOf(this));
      return runChecked(start(info, text, undefined), [], () => original.apply(this, args), replyError);
    };
}

const scriptRaw = (args: unknown[]): unknown[] | null => {
  const script = args[0] as CommandDef | undefined;
  return script?.SHA1 && Array.isArray(args[1]) ? ["EVALSHA", script.SHA1, script.NUMBER_OF_KEYS ?? 0, ...(args[1] as unknown[])] : null;
};

function patchClient(proto: object, start: StartDbSpan): void {
  patchMethod(proto, "sendCommand", oneCommand(start, (a) => (Array.isArray(a[0]) && a[0].length > 0 ? (a[0] as unknown[]) : null)));
  patchMethod(proto, "commandsExecutor", oneCommand(start, (a) => rawOf(a[0] as CommandDef, a[1])));
  patchMethod(proto, "executeScript", oneCommand(start, scriptRaw));
  patchMethod(proto, "multiExecutor", batch(start, (a) => (a[2] === undefined ? "PIPELINE" : "MULTI")));
  patchMethod(proto, "_executeMulti", batch(start, () => "MULTI"));
  patchMethod(proto, "_executePipeline", batch(start, () => "PIPELINE"));
}

type RedisTarget = { prototype?: Record<string, unknown>; default?: unknown; createClient?: () => unknown; sendCommand?: unknown } | null;

/** The client prototype: from the RedisClient class, its module, a client, or a client made (not connected) by createClient. */
function prototypeOf(target: unknown): object | null {
  const t = target as RedisTarget;
  if (typeof target === "function") return typeof t?.prototype?.sendCommand === "function" ? t.prototype : null;
  if (t && typeof t.sendCommand === "function") return ownerOf(t, "sendCommand");
  if (t?.default) return prototypeOf(t.default);
  if (typeof t?.createClient === "function") return prototypeOf(t.createClient());
  return null;
}

/** Trace every node-redis (v4+) command, MULTI, and pipeline. Pass the `redis` or `@redis/client` module, or a client. Returns false when nothing was patched. */
export function instrumentRedis(wizelens: WizeLens, target: unknown): boolean {
  const start = dbSpansOf(wizelens);
  const proto = prototypeOf(target);
  if (!start || !proto) return false;
  patchClient(proto, start);
  return true;
}
