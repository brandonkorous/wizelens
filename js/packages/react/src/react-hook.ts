import { collectCommit, type ComponentStats, type FiberLike } from "./fiber-stats.js";

// React reports every commit to this global hook. React DevTools and React Refresh use it too.
const HOOK_KEY = "__REACT_DEVTOOLS_GLOBAL_HOOK__";

interface FiberRootLike {
  current: FiberLike;
}

interface DevToolsHook {
  onCommitFiberRoot?: (...args: unknown[]) => unknown;
  __wizelens?: boolean;
}

const stats: ComponentStats = new Map();
const nextCommit = new Set<() => void>();
let commits = 0;
let firstMountMs: number | null = null;
let installed = false;

function createHook(): DevToolsHook & Record<string, unknown> {
  const renderers = new Map<number, unknown>();
  return {
    renderers,
    supportsFiber: true,
    isDisabled: false,
    inject(renderer: unknown) {
      renderers.set(renderers.size + 1, renderer);
      return renderers.size;
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
  };
}

/** Record one commit. Never throws: profiling must not break the app. */
export function handleCommit(root: unknown): void {
  try {
    const current = (root as FiberRootLike | null)?.current;
    if (!current) return;
    commits++;
    // The first commit of a root: the previous tree had no child yet.
    if (firstMountMs === null && current.alternate && !current.alternate.child) {
      firstMountMs = current.child?.actualDuration ?? current.actualDuration ?? null;
    }
    collectCommit(current, stats);
  } catch {
    // An unknown React version: skip this commit.
  }
  const waiting = [...nextCommit];
  nextCommit.clear();
  waiting.forEach((cb) => cb());
}

/** Chain onto the React DevTools global hook, or create one. Call before React loads to see the first commit. */
export function installReactHook(target: object = globalThis): boolean {
  try {
    const g = target as Record<string, unknown>;
    if (!g[HOOK_KEY]) g[HOOK_KEY] = createHook();
    const hook = g[HOOK_KEY] as DevToolsHook;
    if (hook.__wizelens) return (installed = true);
    const prev = hook.onCommitFiberRoot;
    hook.onCommitFiberRoot = function (this: unknown, ...args: unknown[]) {
      handleCommit(args[1]);
      return typeof prev === "function" ? prev.apply(this, args) : undefined;
    };
    hook.__wizelens = true;
    return (installed = true);
  } catch {
    return false;
  }
}

/** Component stats and the commit count since the last call. */
export function drainReactStats(): { stats: ComponentStats; commits: number } {
  const out = { stats: new Map(stats), commits };
  stats.clear();
  commits = 0;
  return out;
}

/** Duration of the first React commit (hydration or the first mount). Null when not seen. */
export const firstCommitMs = (): number | null => firstMountMs;

/** Resolves after the next React commit, or after `timeoutMs`. Right away when the hook is not installed. */
export function waitForCommit(timeoutMs: number): Promise<void> {
  if (!installed) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      nextCommit.delete(done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    nextCommit.add(done);
  });
}
