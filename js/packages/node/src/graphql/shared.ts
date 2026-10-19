import { createContextKey } from "@opentelemetry/api";
import { isThenable } from "../db.js";

export interface GraphqlOptions {
  /** Resolver spans: "slow" (default) for resolvers at or over `slowResolverMs`, "all" for every resolver with its own `resolve`, "none" for none. */
  resolvers?: "slow" | "all" | "none";
  /** A resolver at least this slow (ms) gets a span in "slow" mode. Default 50. */
  slowResolverMs?: number;
  /** Keep the operation's document, with literal values replaced, as `graphql.document`. Default true. */
  document?: boolean;
}

/** Set inside a traced operation: only its resolvers are traced. */
export const IN_OPERATION = createContextKey("wizeworks.wizelens.graphql.operation");

export type Method = (this: unknown, ...args: unknown[]) => unknown;

/** Call `fn` and run `done` when it settles, sync or async, with its result or error. Returns what `fn` returns. */
export function afterCall<T>(fn: () => T, done: (result: unknown, error: unknown) => void): T {
  let out: T;
  try {
    out = fn();
  } catch (err) {
    done(undefined, err ?? new Error("GraphQL call failed"));
    throw err;
  }
  if (isThenable(out)) out.then((value) => done(value, undefined), (err: unknown) => done(undefined, err ?? new Error("rejected")));
  else done(out, undefined);
  return out;
}
