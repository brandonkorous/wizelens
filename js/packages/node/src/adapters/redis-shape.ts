import { ATTR_DB_FINGERPRINT } from "@wizeworks/lens-core/internal";
import type { DbCallInfo } from "../types.js";
import { clip, fingerprint, isIdLike, serverAttributes } from "./nosql.js";

const words = (list: string): Set<string> => new Set(list.split(/\s+/).filter(Boolean));

// Commands with no key: their arguments (a password, a script, a config value) are never shown.
const NO_KEYS = words(`AUTH HELLO PING ECHO INFO SELECT QUIT FLUSHDB FLUSHALL DBSIZE CONFIG CLIENT CLUSTER COMMAND TIME MULTI EXEC DISCARD
  SCRIPT SCAN RANDOMKEY SAVE BGSAVE BGREWRITEAOF LASTSAVE ROLE SLOWLOG MEMORY MODULE ACL FUNCTION SWAPDB WAIT READONLY READWRITE RESET
  UNWATCH LATENCY MONITOR DEBUG SHUTDOWN REPLICAOF SLAVEOF`);
const ALL_KEYS = words("MGET DEL UNLINK EXISTS TOUCH WATCH SINTER SUNION SDIFF PFCOUNT PFMERGE SINTERSTORE SUNIONSTORE SDIFFSTORE");
const PAIRS = words("MSET MSETNX");
const TWO_KEYS = words("RENAME RENAMENX RPOPLPUSH SMOVE LMOVE BLMOVE BRPOPLPUSH COPY");
const BLOCKING = words("BLPOP BRPOP BZPOPMIN BZPOPMAX");
const SCRIPTS = words("EVAL EVALSHA EVAL_RO EVALSHA_RO FCALL FCALL_RO");
const MAX_KEYS = 5;
const MAX_COMMANDS = 10;

/** The key arguments of a command. Every other argument is a value and is dropped. */
export function keysOf(name: string, args: readonly unknown[]): unknown[] {
  if (NO_KEYS.has(name)) return [];
  if (ALL_KEYS.has(name)) return [...args];
  if (PAIRS.has(name)) return args.filter((_, i) => i % 2 === 0);
  if (TWO_KEYS.has(name)) return args.slice(0, 2);
  if (BLOCKING.has(name)) return args.slice(0, -1);
  if (SCRIPTS.has(name)) return args.slice(2, 2 + (Number(args[1]) || 0));
  return args.slice(0, 1);
}

const SEPARATORS = /([:/|#,={}\s]+)/;

/** A key with its ids, emails, and tokens as `?`: "user:123:cart" is "user:?:cart". */
export function keyShape(key: unknown): string {
  if (typeof key !== "string") return "?";
  const parts = key.split(SEPARATORS).map((part, i) => (i % 2 === 1 || !isIdLike(part) ? part : "?"));
  return clip(parts.join(""), 200);
}

/** `GET user:?`: the command and the shapes of its keys, never the values. */
export function commandText(name: string, args: readonly unknown[]): string {
  const upper = name.toUpperCase();
  const shapes = [...new Set(keysOf(upper, args).map(keyShape))];
  const keys = shapes.length > MAX_KEYS ? [...shapes.slice(0, MAX_KEYS), "…"] : shapes;
  return [upper, ...keys].join(" ");
}

/** Where a client sends its commands. */
export interface RedisConn {
  namespace: string;
  host?: string;
  port?: number;
}

/** One queued command of a pipeline or transaction. */
export interface RedisCommand {
  name: string;
  args: readonly unknown[];
}

const infoOf = (adapter: string, operation: string, conn: RedisConn, extra: Record<string, string | number>): DbCallInfo => ({
  system: "redis",
  adapter,
  operation,
  namespace: conn.namespace,
  requireParent: true,
  attributes: { ...serverAttributes(conn.host, conn.port), ...extra },
});

/** The span facts and query text of one command. */
export function commandCall(adapter: string, cmd: RedisCommand, conn: RedisConn): { info: DbCallInfo; text: string } {
  const name = cmd.name.toUpperCase();
  const info = infoOf(adapter, name, conn, { [ATTR_DB_FINGERPRINT]: fingerprint([name, ...cmd.args]) });
  return { info, text: commandText(name, cmd.args) };
}

/** The span facts of a pipeline or MULTI: one span, the command count, and each distinct command shape. */
export function batchCall(adapter: string, kind: "PIPELINE" | "MULTI", cmds: readonly RedisCommand[], conn: RedisConn): { info: DbCallInfo; text: string } {
  const shapes = [...new Set(cmds.map((c) => commandText(c.name, c.args)))];
  const listed = shapes.length > MAX_COMMANDS ? [...shapes.slice(0, MAX_COMMANDS), "…"] : shapes;
  const values = cmds.flatMap((c) => [c.name.toUpperCase(), ...c.args]);
  const extra = { "db.operation.batch.size": cmds.length, [ATTR_DB_FINGERPRINT]: fingerprint(values) };
  return { info: { ...infoOf(adapter, kind, conn, extra), rowsOf: () => undefined }, text: clip(`${kind} ${listed.join("; ")}`) };
}

/** The first failed reply of a pipeline: ioredis gives [err, value] pairs, node-redis gives the error itself. */
export function replyError(result: unknown): unknown {
  if (!Array.isArray(result)) return undefined;
  for (const reply of result) {
    if (reply instanceof Error) return reply;
    if (Array.isArray(reply) && reply[0] instanceof Error) return reply[0];
  }
  return undefined;
}
