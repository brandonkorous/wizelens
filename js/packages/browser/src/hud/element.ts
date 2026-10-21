import { DEFAULT_SLOW_MS } from "@wizeworks/lens-core";
import type { Recorder } from "../recorder-types.js";
import { HudController } from "./controller.js";
import { HUD_CSS } from "./style.js";

export const HUD_TAG = "wizelens-hud";

// Safe to import without a page (server render): the real base class is only needed once an element is made.
const Base = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as typeof HTMLElement;

/** `<wizelens-hud>`: the in-page HUD, in an open shadow root. Set `recorder` to show one; `slowMs` or `slow-ms` sets the slow mark. */
export class WizeLensHudElement extends Base {
  static readonly observedAttributes = ["slow-ms"];
  #recorder: Recorder | null = null;
  #slowMs: number | null = null;
  #controller: HudController | null = null;
  #mount: HTMLElement | null = null;

  get recorder(): Recorder | null {
    return this.#recorder;
  }

  set recorder(value: Recorder | null) {
    this.#recorder = value;
    this.#restart();
  }

  /** Requests at or over this many ms show as "warning". Default 500. */
  get slowMs(): number {
    const attr = Number(this.getAttribute("slow-ms") ?? NaN);
    return this.#slowMs ?? (Number.isFinite(attr) && attr > 0 ? attr : DEFAULT_SLOW_MS);
  }

  set slowMs(value: number | null) {
    this.#slowMs = value;
    this.#controller?.queue();
  }

  connectedCallback(): void {
    this.#upgrade("recorder");
    this.#upgrade("slowMs");
    this.#restart();
  }

  disconnectedCallback(): void {
    this.#controller?.stop();
    this.#controller = null;
  }

  attributeChangedCallback(): void {
    this.#controller?.queue();
  }

  // A property set before the element was defined hides the accessor. Move it through the setter.
  #upgrade(name: "recorder" | "slowMs"): void {
    if (!Object.prototype.hasOwnProperty.call(this, name)) return;
    const value = (this as Record<string, unknown>)[name];
    delete (this as Record<string, unknown>)[name];
    (this as Record<string, unknown>)[name] = value;
  }

  #restart(): void {
    this.#controller?.stop();
    this.#controller = null;
    if (!this.isConnected || !this.#recorder) return;
    this.#controller = new HudController(this.#recorder, this.#mount ?? this.#attach(), () => this.slowMs);
    this.#controller.start();
  }

  #attach(): HTMLElement {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = HUD_CSS;
    this.#mount = document.createElement("div");
    root.append(style, this.#mount);
    return this.#mount;
  }
}

/** Define `<wizelens-hud>` once per page. False without a page. */
export function defineHud(): boolean {
  if (typeof customElements === "undefined" || typeof HTMLElement === "undefined") return false;
  if (!customElements.get(HUD_TAG)) customElements.define(HUD_TAG, WizeLensHudElement);
  return true;
}

export interface HudOptions {
  /** Requests at or over this many ms show as "warning". Default 500. */
  slowMs?: number;
}

/** Add the HUD for `recorder` to the page (once the body exists). Returns a function that takes it away. */
export function mountHud(recorder: Recorder, options: HudOptions = {}): () => void {
  if (typeof document === "undefined" || typeof document.createElement !== "function" || !defineHud()) return () => {};
  const el = document.createElement(HUD_TAG) as WizeLensHudElement;
  el.recorder = recorder;
  if (options.slowMs !== undefined) el.slowMs = options.slowMs;
  let removed = false;
  const add = () => void (!removed && document.body.appendChild(el));
  if (document.body) add();
  else document.addEventListener("DOMContentLoaded", add, { once: true });
  return () => {
    removed = true;
    document.removeEventListener("DOMContentLoaded", add);
    el.remove();
  };
}
