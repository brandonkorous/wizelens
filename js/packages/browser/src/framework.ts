import type { Span } from "@wizeworks/lens-core/internal";
import type { ViewRef } from "./browser-span.js";

/** What a UI framework adds to browser capture: render stats, hydration time, and the wait for a route change to render. */
export interface FrameworkHooks {
  /** Runs when capture starts, for example to hook the framework's renderer. */
  install?(): void;
  /** A render stats span for what rendered since `sinceMs`, or null when nothing did. Read on a timer and when a view ends. */
  statsSpan?(view: ViewRef, sinceMs: number, sessionId: string): Span | null;
  /** How often `statsSpan` is read. Default 5000 ms. */
  statsIntervalMs?: number;
  /** Duration of the first render (hydration or the first mount), or null when not seen. */
  firstRenderMs?(): number | null;
  /** Resolves after the next render, or after `timeoutMs`. */
  waitForRender?(timeoutMs: number): Promise<void>;
}
