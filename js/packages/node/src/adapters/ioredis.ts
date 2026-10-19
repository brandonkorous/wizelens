import { runTraced, type StartDbSpan } from "../db.js";
import type { WizeLens } from "../types.js";
import { runChecked } from "./nosql.js";
import { batchCall, commandCall, type RedisConn, replyError } from "./redis-shape.js";
import { dbSpansOf, patchMethod } from "./registry.js";

interface IoCommand {
  name?: string;
  args?: unknown[];
}

interface IoRedisLike {
  options?: { host?: string; port?: number; db?: number; path?: string };
  condition?: { select?: number } | null;
}

interface IoPipelineLike {
  _queue?: IoCommand[];
  redis?: IoRedisLike;
}

type ClassLike = { prototype?: Record<string, unknown> };
type IoTarget = ClassLike & { Redis?: unknown; Cluster?: ClassLike; Pipeline?: ClassLike; default?: unknown; sendCommand?: unknown; pipeline?: () => unknown };

// A command the offline queue or a cluster sends again is the same call: one span.
const traced = new WeakSet<object>();

function connOf(client: IoRedisLike | undefined): RedisConn {
  const o = client?.options ?? {};
  return { namespace: String(client?.condition?.select ?? o.db ?? 0), host: o.path ? undefined : o.host, port: o.port };
}

function traceSend(proto: object, start: StartDbSpan): void {
  patchMethod(proto, "sendCommand", (original) =>
    function (this: IoRedisLike, ...args: unknown[]) {
      const command = args[0] as IoCommand | undefined;
      const stream = args[1] as { isPipeline?: boolean } | undefined;
      if (!command?.name || stream?.isPipeline || traced.has(command)) return original.apply(this, args);
      traced.add(command);
      const { info, text } = commandCall("ioredis", { name: command.name, args: command.args ?? [] }, connOf(this));
      return runTraced(start(info, text, undefined), [], () => original.apply(this, args));
    },
  );
}

function traceExec(proto: object, start: StartDbSpan): void {
  patchMethod(proto, "exec", (original) =>
    function (this: IoPipelineLike, ...args: unknown[]) {
      const queue = (this._queue ?? []).map((c) => ({ name: String(c.name ?? ""), args: c.args ?? [] }));
      const kind = queue.some((c) => c.name.toLowerCase() === "multi") ? "MULTI" : "PIPELINE";
      const cmds = queue.filter((c) => !["multi", "exec"].includes(c.name.toLowerCase()));
      if (cmds.length === 0) return original.apply(this, args);
      const { info, text } = batchCall("ioredis", kind, cmds, connOf(this.redis));
      return runChecked(start(info, text, undefined), [], () => original.apply(this, args), replyError);
    },
  );
}

const protoOf = (c: ClassLike | undefined): object[] => (c?.prototype ? [c.prototype] : []);

/** Client prototypes (Redis, Cluster) and the Pipeline prototype, from the module, its default export, or a client. */
function targetsOf(target: unknown): { clients: object[]; pipelines: object[] } {
  const t = target as IoTarget | null;
  if (typeof target === "function" && typeof t?.prototype?.sendCommand === "function") {
    return { clients: [...protoOf(t), ...protoOf(t.Cluster)], pipelines: protoOf(t.Pipeline) };
  }
  if (t?.Redis || t?.default) return targetsOf(t.Redis ?? t.default);
  if (t && typeof t.sendCommand === "function") {
    const made = typeof t.pipeline === "function" ? (t.pipeline() as object | undefined) : undefined;
    return { clients: [Object.getPrototypeOf(t) as object], pipelines: made ? [Object.getPrototypeOf(made) as object] : [] };
  }
  return { clients: [], pipelines: [] };
}

/** Trace every ioredis command, pipeline, and MULTI. Pass the `ioredis` module (covers Redis, Cluster, and pipelines) or a client. Returns false when nothing was patched. */
export function instrumentIoRedis(wizelens: WizeLens, target: unknown): boolean {
  const start = dbSpansOf(wizelens);
  const { clients, pipelines } = targetsOf(target);
  if (!start || clients.length === 0) return false;
  for (const proto of clients) traceSend(proto, start);
  for (const proto of pipelines) traceExec(proto, start);
  return true;
}
