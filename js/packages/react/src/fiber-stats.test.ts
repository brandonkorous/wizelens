import { describe, expect, it, vi } from "vitest";
import { collectCommit, type ComponentStats, type FiberLike, topComponents } from "./fiber-stats.js";
import { drainReactStats, firstCommitMs, installReactHook } from "./react-hook.js";

function fiber(type: unknown, extra: Partial<FiberLike> = {}): FiberLike {
  return { tag: 0, type, child: null, sibling: null, alternate: null, memoizedProps: {}, memoizedState: null, flags: 1, actualDuration: 2, selfBaseDuration: 1, ...extra };
}

function chain(parent: FiberLike, children: FiberLike[]): FiberLike {
  parent.child = children[0] ?? null;
  children.forEach((c, i) => (c.sibling = children[i + 1] ?? null));
  return parent;
}

function Card() {}
function Price() {}
function Hidden() {}
const Ctx = {};

describe("fiber stats", () => {
  it("counts mounts, real updates, wasted renders, and context renders", () => {
    const props = { id: 1 };
    const prevCard = fiber(Card, { memoizedProps: { id: 1, n: 1 } });
    const prevPrice = fiber(Price, { memoizedProps: props, dependencies: { firstContext: { context: Ctx, memoizedValue: 1, next: null } } });
    const prevWasted = fiber(Price, { memoizedProps: props });
    const card = fiber(Card, { alternate: prevCard, memoizedProps: { id: 1, n: 2 }, actualDuration: 5 });
    const price = fiber(Price, { alternate: prevPrice, memoizedProps: props, dependencies: { firstContext: { context: Ctx, memoizedValue: 2, next: null } } });
    const wasted = fiber(Price, { alternate: prevWasted, memoizedProps: props });
    const skipped = fiber(Price, { alternate: fiber(Price), flags: 0 });
    const mounted = fiber(Hidden);
    const prevRoot = chain(fiber(null, { tag: 3 }), [prevCard, prevPrice, prevWasted]);
    const root = chain(fiber(null, { tag: 3, alternate: prevRoot }), [card, price, wasted, skipped, mounted]);
    const out: ComponentStats = new Map();
    collectCommit(root, out);
    expect(out.get("Card")).toMatchObject({ renders: 1, actualMs: 5, wasted: 0, context: 0 });
    expect(out.get("Price")).toMatchObject({ renders: 2, wasted: 1, context: 1 });
    expect(out.get("Hidden")).toMatchObject({ renders: 1 });
  });

  it("skips subtrees React did not visit, and the HUD", () => {
    const reused = chain(fiber(Card), [fiber(Price)]);
    const prevRoot = chain(fiber(null, { tag: 3 }), [reused]);
    const hud = Object.assign(() => {}, { __wizelens: true });
    const root = chain(fiber(null, { tag: 3, alternate: prevRoot }), [reused, chain(fiber(hud), [fiber(Price)])]);
    const out: ComponentStats = new Map();
    collectCommit(root, out);
    expect(out.size).toBe(0);
  });

  it("names forwardRef and displayName components and sorts by cost", () => {
    const out: ComponentStats = new Map();
    const fwd = fiber({ render: function Inner() {} }, { tag: 11, actualDuration: 9 });
    const named = fiber(Object.assign(() => {}, { displayName: "Fancy" }), { actualDuration: 1 });
    collectCommit(chain(fiber(null, { tag: 3, alternate: fiber(null, { tag: 3 }) }), [fwd, named]), out);
    expect(topComponents(out).map((s) => s.name)).toEqual(["Inner", "Fancy"]);
  });
});

describe("react hook", () => {
  it("chains onto an existing hook and records commits", () => {
    const prev = vi.fn();
    const target = { __REACT_DEVTOOLS_GLOBAL_HOOK__: { onCommitFiberRoot: prev } };
    expect(installReactHook(target)).toBe(true);
    expect(installReactHook(target)).toBe(true);
    const current = chain(fiber(null, { tag: 3, alternate: fiber(null, { tag: 3 }) }), [fiber(Card, { actualDuration: 7 })]);
    drainReactStats();
    target.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot(1, { current }, 0, false);
    expect(prev).toHaveBeenCalledTimes(1);
    expect(firstCommitMs()).toBe(7);
    const { stats, commits } = drainReactStats();
    expect(commits).toBe(1);
    expect(stats.get("Card")).toMatchObject({ renders: 1 });
    expect(drainReactStats().commits).toBe(0);
  });

  it("creates a hook React can inject into when there is none", () => {
    const target: Record<string, unknown> = {};
    expect(installReactHook(target)).toBe(true);
    const hook = target.__REACT_DEVTOOLS_GLOBAL_HOOK__ as { inject(r: unknown): number; supportsFiber: boolean };
    expect(hook.supportsFiber).toBe(true);
    expect(hook.inject({})).toBe(1);
  });
});
