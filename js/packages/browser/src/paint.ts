import { now } from "./session.js";

const BODY_READERS = ["json", "text", "blob", "arrayBuffer", "formData", "bytes"] as const;

// A frame later than this after the app's work means the browser held back frames (covered or background window).
const LATE_FRAME_MS = 50;

/** Time just after the next paint, or when the app's work ended if frames are held back. Null when the page cannot paint. */
export function afterNextPaint(): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function" || typeof document === "undefined" || document.visibilityState === "hidden") {
      return resolve(null);
    }
    let idleAt: number | null = null;
    // Two task hops: the app's state update and the framework's render task run first.
    setTimeout(() => setTimeout(() => (idleAt = now()), 0), 0);
    const settle = (paintedAt: number | null) => {
      if (idleAt === null) return resolve(paintedAt);
      resolve(paintedAt !== null && paintedAt - idleAt <= LATE_FRAME_MS ? paintedAt : idleAt);
    };
    const giveUp = setTimeout(() => settle(null), 1000);
    requestAnimationFrame(() => {
      clearTimeout(giveUp);
      // rAF callbacks run before the paint. A task queued here runs after it.
      setTimeout(() => settle(now()), 0);
    });
  });
}

/** Call `onRead` once, when the app has read the response body. */
export function watchBody(response: Response, onRead: () => void): void {
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    onRead();
  };
  for (const name of BODY_READERS) {
    const read: unknown = (response as unknown as Record<string, unknown>)[name];
    if (typeof read !== "function") continue;
    try {
      Object.defineProperty(response, name, {
        configurable: true,
        writable: true,
        value(this: Response, ...args: unknown[]) {
          const result = (read as (...a: unknown[]) => Promise<unknown>).apply(this, args);
          result.then(fire, fire);
          return result;
        },
      });
    } catch {
      // A frozen response: no render time for this one.
    }
  }
}
