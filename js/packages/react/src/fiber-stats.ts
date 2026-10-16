import type { ReactComponentStat } from "@wizeworks/lens-core";

/** The parts of a React fiber this file reads. React dev builds have them all. */
export interface FiberLike {
  tag: number;
  type: unknown;
  child: FiberLike | null;
  sibling: FiberLike | null;
  alternate: FiberLike | null;
  memoizedProps: unknown;
  memoizedState: unknown;
  flags?: number;
  actualDuration?: number;
  selfBaseDuration?: number;
  dependencies?: { firstContext: ContextDep | null } | null;
}

interface ContextDep {
  context: unknown;
  memoizedValue: unknown;
  next: ContextDep | null;
}

interface HookLike {
  memoizedState: unknown;
  queue: unknown;
  next: HookLike | null;
}

export type ComponentStats = Map<string, ReactComponentStat>;

// Function, class, forwardRef, and simple memo components. Memo (14) wraps a fiber that is counted itself.
const USER_TAGS = new Set([0, 1, 11, 15]);
const CLASS_TAG = 1;
const PERFORMED_WORK = 1;
const MAX_COMPONENTS = 500;

type Named = { displayName?: string; name?: string; render?: Named; type?: Named; __wizelens?: boolean };

export function componentName(fiber: FiberLike): string {
  const t = fiber.type as Named | null;
  const inner = fiber.tag === 11 ? t?.render : t;
  return t?.displayName || inner?.displayName || inner?.name || "Anonymous";
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

// State hooks (useState, useReducer) have a queue. Effect and memo hooks change identity on every render.
function statesEqual(f: FiberLike, prev: FiberLike): boolean {
  if (f.tag === CLASS_TAG) return shallowEqual(f.memoizedState, prev.memoizedState);
  let h = f.memoizedState as HookLike | null;
  let p = prev.memoizedState as HookLike | null;
  while (h && p) {
    if (h.queue && !Object.is(h.memoizedState, p.memoizedState)) return false;
    h = h.next;
    p = p.next;
  }
  return true;
}

function contextChanged(f: FiberLike, prev: FiberLike): boolean {
  for (let d = f.dependencies?.firstContext ?? null; d; d = d.next) {
    let p = prev.dependencies?.firstContext ?? null;
    while (p && p.context !== d.context) p = p.next;
    if (p && !Object.is(p.memoizedValue, d.memoizedValue)) return true;
  }
  return false;
}

function record(f: FiberLike, out: ComponentStats): void {
  const prev = f.alternate;
  if (prev && ((f.flags ?? 0) & PERFORMED_WORK) === 0) return;
  const name = componentName(f);
  let s = out.get(name);
  if (!s) {
    if (out.size >= MAX_COMPONENTS) return;
    s = { name, renders: 0, actualMs: 0, selfMs: 0, wasted: 0, context: 0 };
    out.set(name, s);
  }
  s.renders++;
  s.actualMs += f.actualDuration ?? 0;
  s.selfMs += f.selfBaseDuration ?? 0;
  if (!prev || !shallowEqual(f.memoizedProps, prev.memoizedProps) || !statesEqual(f, prev)) return;
  if (contextChanged(f, prev)) s.context++;
  else s.wasted++;
}

const isWizeLens = (f: FiberLike) => (f.type as Named | null)?.__wizelens === true;

/** Add the components that rendered in this commit to `out`. Subtrees React did not visit are skipped. */
export function collectCommit(root: FiberLike, out: ComponentStats): void {
  const stack: FiberLike[] = [root];
  while (stack.length > 0) {
    const fiber = stack.pop()!;
    const reused = new Set<FiberLike>();
    for (let c = fiber.alternate?.child ?? null; c; c = c.sibling) reused.add(c);
    for (let c = fiber.child; c; c = c.sibling) {
      if (reused.has(c) || isWizeLens(c)) continue;
      if (USER_TAGS.has(c.tag)) record(c, out);
      stack.push(c);
    }
  }
}

/** Most own render time first, at most `limit`. Children are not counted, so wrappers do not crowd out real hotspots. */
export function topComponents(stats: ComponentStats, limit = 50): ReactComponentStat[] {
  const round = (v: number) => Math.round(v * 100) / 100;
  return [...stats.values()]
    .sort((a, b) => b.selfMs - a.selfMs || b.renders - a.renders)
    .slice(0, limit)
    .map((s) => ({ ...s, actualMs: round(s.actualMs), selfMs: round(s.selfMs) }));
}
