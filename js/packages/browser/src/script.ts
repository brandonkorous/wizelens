// Entry of the script-tag bundle (`window.WizeLens`). A tag with `data-endpoint` starts WizeLens on its own.
import { initWizeLens, type WizeLensOptions } from "./lens.js";

export * from "./index.js";

/** Options from a script tag's data attributes, or null when it has no `data-endpoint`. */
export function scriptOptions(el: { getAttribute(name: string): string | null } | null): WizeLensOptions | null {
  const endpoint = el?.getAttribute("data-endpoint");
  if (!el || endpoint == null) return null;
  const off = (name: string) => el.getAttribute(name) === "false";
  return {
    endpoint: endpoint || undefined,
    release: el.getAttribute("data-release") ?? undefined,
    enabled: !off("data-enabled"),
    captureConsole: !off("data-console"),
    captureXhr: !off("data-xhr"),
  };
}

const auto = typeof document !== "undefined" ? scriptOptions(document.currentScript) : null;
if (auto) initWizeLens(auto);
