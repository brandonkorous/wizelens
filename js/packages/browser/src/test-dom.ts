import { vi } from "vitest";
import { type Span } from "@wizeworks/lens-core/internal";
import { type Call, echoServer, stubPage } from "./test-env.js";

// A small page for Node: window events, history that moves `location`, and a document. Enough for page capture to run.
export function stubDom(url = "http://app.test/page"): EventTarget {
  stubPage();
  vi.stubGlobal("location", new URL(url));
  const events = new EventTarget();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("addEventListener", events.addEventListener.bind(events));
  vi.stubGlobal("removeEventListener", events.removeEventListener.bind(events));
  vi.stubGlobal("dispatchEvent", events.dispatchEvent.bind(events));
  vi.stubGlobal("document", { visibilityState: "visible", readyState: "complete", images: [], currentScript: null });
  const move = (_state: unknown, _title: string, to?: string | URL | null) => {
    if (to != null) (location as unknown as URL).href = new URL(String(to), location.href).href;
  };
  vi.stubGlobal("history", { pushState: move, replaceState: move });
  return events;
}

/** A fake server on `globalThis.fetch` that records every call. */
export function stubServer(): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = echoServer(calls);
  return calls;
}

/** The posted spans of one browser type ("pageview", "error", "fetch"). */
export function spansOf(spans: Span[], type: string): Span[] {
  return spans.filter((s) => (s.attributes["wizelens.browser.type"] ?? "fetch") === type);
}

/** Let held spans and timers settle. */
export const settle = (ms = 10) => new Promise((r) => setTimeout(r, ms));
