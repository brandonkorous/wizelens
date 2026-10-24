// Entry of the script-tag bundle (`window.WizeLens`). A tag with `data-endpoint` or `data-key` starts WizeLens on its own.
import { cloudEndpoint } from "./cloud.js";
import { startWizeLens, type WizeLensOptions } from "./lens.js";
import type { InstanceSource } from "./registry.js";

export * from "./index.js";

/** A script tag's options, and who put the tag in the page (`data-source="inject"`: a server did). */
export interface ScriptOptions extends WizeLensOptions {
  source: InstanceSource;
}

function hudOf(value: string | null): boolean | "auto" {
  return value === "true" ? true : value === "false" ? false : "auto";
}

function positive(value: string | null): number | undefined {
  const n = Number(value ?? NaN);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Options from a script tag's data attributes, or null when it has neither `data-endpoint` nor `data-key` (a browser key: send to WizeLens Cloud, or to the cloud at `data-endpoint`). */
export function scriptOptions(el: { getAttribute(name: string): string | null } | null): ScriptOptions | null {
  const key = el?.getAttribute("data-key");
  const raw = el?.getAttribute("data-endpoint");
  const endpoint = key ? cloudEndpoint(key, raw || undefined) : raw;
  if (!el || endpoint == null) return null;
  const off = (name: string) => el.getAttribute(name) === "false";
  return {
    endpoint: endpoint || undefined,
    release: el.getAttribute("data-release") ?? undefined,
    service: el.getAttribute("data-service") ?? undefined,
    enabled: !off("data-enabled"),
    captureConsole: !off("data-console"),
    captureXhr: !off("data-xhr"),
    hud: hudOf(el.getAttribute("data-hud")),
    slowMs: positive(el.getAttribute("data-slow-ms")),
    source: el.getAttribute("data-source") === "inject" ? "inject" : "app",
  };
}

/** Start from a tag. An injected tag waits for the page's `load` and does nothing when an instance already runs. */
export function startFromTag({ source, ...options }: ScriptOptions): void {
  if (source === "app") return void startWizeLens(options, "app");
  const go = () => void startWizeLens(options, "inject");
  if (document.readyState === "complete") go();
  else addEventListener("load", go, { once: true });
}

const auto = typeof document !== "undefined" ? scriptOptions(document.currentScript) : null;
if (auto) startFromTag(auto);
