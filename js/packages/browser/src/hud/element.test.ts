import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { stubDom } from "../test-dom.js";
import { byClass, FakeElement, findAll, flushRenders, one, stubHudDom } from "../test-hud-dom.js";
import { fakeRecorder, type FakeRecorder, row, stubLocalStorage } from "../test-hud.js";

type ElementModule = typeof import("./element.js");
let mod: ElementModule;
let body: FakeElement;
let recorder: FakeRecorder;

beforeEach(async () => {
  stubDom();
  body = stubHudDom();
  stubLocalStorage();
  recorder = fakeRecorder();
  // The element's base class is read on import, so the fake DOM goes in first.
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.resetModules();
  mod = await import("./element.js");
});
afterEach(() => vi.unstubAllGlobals());

const huds = () => findAll(body, (el) => el.nodeName === "WIZELENS-HUD");

it("adds <wizelens-hud> with its styles and the HUD in an open shadow root, and takes it away", () => {
  const unmount = mod.mountHud(recorder);
  const [el] = huds();
  const shadow = el!.shadowRoot!;
  expect(shadow.childNodes[0]!.nodeName).toBe("STYLE");
  expect(shadow.childNodes[0]!.textContent).toContain(":host{all:initial}");
  expect(byClass(shadow, "wl-card")).toHaveLength(1);
  expect(recorder.listeners()).toBe(1);
  unmount();
  expect(huds()).toHaveLength(0);
  expect(recorder.listeners()).toBe(0);
});

it("defines the element once, whatever number of HUDs mount", () => {
  const define = vi.spyOn(customElements, "define");
  const a = mod.mountHud(recorder);
  const b = mod.mountHud(recorder);
  expect(define).toHaveBeenCalledOnce();
  expect(customElements.get(mod.HUD_TAG)).toBe(mod.WizeLensHudElement);
  a();
  b();
});

it("marks slow requests from slowMs, set as an option or an attribute", async () => {
  recorder.store.upsert(row({ durationMs: 700, renderMs: 0, profiled: false }));
  const unmount = mod.mountHud(recorder, { slowMs: 1000 });
  const el = huds()[0]!;
  expect(one(el, "wl-card").getAttribute("class")).toBe("wl-card wl-h-success");
  (el as unknown as InstanceType<ElementModule["WizeLensHudElement"]>).slowMs = null;
  el.setAttribute("slow-ms", "600");
  await flushRenders();
  expect(one(el, "wl-card").getAttribute("class")).toBe("wl-card wl-h-warning");
  unmount();
});

it("waits for the body when the page has none yet", () => {
  const doc = document as unknown as { body: FakeElement | null };
  doc.body = null;
  const unmount = mod.mountHud(recorder);
  doc.body = body;
  document.dispatchEvent(new Event("DOMContentLoaded"));
  expect(huds()).toHaveLength(1);
  unmount();
});

it("takes a recorder set before the element was defined", () => {
  mod.defineHud();
  const el = new mod.WizeLensHudElement() as unknown as FakeElement;
  Object.defineProperty(el, "recorder", { value: recorder, writable: true, configurable: true, enumerable: true });
  body.appendChild(el);
  expect(byClass(el, "wl-card")).toHaveLength(1);
  el.remove();
});

it("does nothing without a page", () => {
  vi.stubGlobal("customElements", undefined);
  expect(mod.defineHud()).toBe(false);
  const unmount = mod.mountHud(recorder);
  expect(huds()).toHaveLength(0);
  unmount();
  vi.stubGlobal("document", undefined);
  expect(() => mod.mountHud(recorder)()).not.toThrow();
});
