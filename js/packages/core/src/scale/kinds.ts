// Rollup kinds: what each grouping counts, and which extra fields it keeps.

/** Joins the parts of a rollup key. Never appears in names, paths, or SQL. */
export const KEY_SEP = "\u001f";
/** Named counters per rollup row: c0..c5. */
export const COUNTER_SLOTS = 6;

export type RollupKind =
  | "trace" | "req" | "req.dim" | "req.svc" | "req.part"
  | "svc" | "svc.ep" | "edge" | "bn.layer" | "bn.owner"
  | "ins" | "ins.ep"
  | "db" | "db.q" | "db.qe" | "db.t" | "db.op"
  | "err" | "err.g" | "err.ge" | "err.t" | "err.s" | "err.e"
  | "log" | "log.s"
  | "pv" | "pv.route" | "pv.m" | "pv.large" | "pv.g"
  | "react" | "rc" | "rc.route";

export interface KindSpec {
  /** Names of the counters, in slot order (c0, c1, ...). */
  counters: readonly string[];
  /** Counter slots that hold whole numbers, so weighted totals can round them. n and err are always whole. */
  ints: readonly number[];
  /** Keeps a value histogram (for percentiles). */
  hist: boolean;
  /** Keeps one representative: the newest item, or the one with the largest measure. */
  top: "newest" | "largest" | null;
  /** Keeps up to this many newest trace ids. */
  ids: number;
}

const spec = (counters: readonly string[] = [], over: Partial<KindSpec> = {}): KindSpec => ({
  counters,
  ints: counters.map((_, i) => i),
  hist: false,
  top: null,
  ids: 0,
  ...over,
});

const REQ = ["dbCount", "withInsights", "insights"];

export const KIND_SPEC: Record<RollupKind, KindSpec> = {
  trace: spec(["slow"]),
  req: spec(REQ, { hist: true }),
  "req.dim": spec(REQ),
  "req.svc": spec(["dbCount", "withInsights", "primary"]),
  "req.part": spec([], { hist: true }),
  svc: spec([], { hist: true, top: "newest" }),
  "svc.ep": spec(),
  edge: spec([], { top: "newest" }),
  "bn.layer": spec([], { top: "newest" }),
  "bn.owner": spec(),
  ins: spec(["count"], { top: "newest" }),
  "ins.ep": spec(),
  db: spec(["slow"]),
  "db.q": spec(["slow"], { top: "largest" }),
  "db.qe": spec(),
  "db.t": spec(["withRows", "rows"]),
  "db.op": spec(),
  err: spec(["critical"]),
  "err.g": spec(["critical"], { top: "newest", ids: 50 }),
  "err.ge": spec(),
  "err.t": spec(),
  "err.s": spec(),
  "err.e": spec(),
  log: spec(),
  "log.s": spec(),
  pv: spec(),
  "pv.route": spec([], { top: "newest" }),
  "pv.m": spec(),
  "pv.large": spec([], { hist: true }),
  "pv.g": spec([], { hist: true }),
  react: spec(),
  rc: spec(["renders", "actualMs", "selfMs", "wasted", "context"], { ints: [0, 3, 4], top: "newest" }),
  "rc.route": spec(),
};

export const ROLLUP_KINDS = Object.keys(KIND_SPEC) as RollupKind[];

export const isRollupKind = (v: string): v is RollupKind => v in KIND_SPEC;

export const joinKey = (...parts: string[]): string => parts.join(KEY_SEP);

export const splitKey = (k: string): string[] => k.split(KEY_SEP);

/** Index of a named counter of a kind, for readable model code. */
export function counterOf(kind: RollupKind, name: string): number {
  const i = KIND_SPEC[kind].counters.indexOf(name);
  if (i < 0) throw new Error(`${kind} has no counter ${name}`);
  return i;
}
