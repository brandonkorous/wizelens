import { vi } from "vitest";

// A page just big enough for lens-browser to start and add its HUD. Stub it before importing the package.
export interface StubbedPage {
  /** The URLs WizeLens asked the server for. */
  urls: string[];
  /** The HUD elements added to the body. */
  huds: { slowMs: number }[];
}

class FakeElement {
  getAttribute = (): string | null => null;
  remove(): void {}
}

export function stubPage(): StubbedPage {
  const page: StubbedPage = { urls: [], huds: [] };
  const defined = new Map<string, new () => FakeElement>();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("location", new URL("http://app.test/"));
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("customElements", { get: (name: string) => defined.get(name), define: (name: string, c: new () => FakeElement) => void defined.set(name, c) });
  const body = { appendChild: (el: { slowMs: number }) => void page.huds.push(el) };
  vi.stubGlobal("document", { body, createElement: (tag: string) => new (defined.get(tag) ?? FakeElement)(), addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    page.urls.push(String(input));
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  return page;
}

/** Clear what a started instance left on the page. */
export function clearPage(): void {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("wizelens.browser")];
  delete (globalThis as { __wizelensLoadView?: unknown }).__wizelensLoadView;
  vi.unstubAllGlobals();
}
