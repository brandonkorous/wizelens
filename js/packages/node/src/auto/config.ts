import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { envFlag } from "@wizeworks/lens-core";
import { HUD_ENV } from "../mode.js";
import type { WizeLensOptions } from "../types.js";

type Env = Record<string, string | undefined>;

/** Comma list of auto hooks to leave off, for example "prisma,pino". */
export const SKIP_ENV = "WIZELENS_AUTO_SKIP";

/** The `name` of the first package.json at or above `dir`, skipping packages inside node_modules. */
export function packageNameAbove(dir: string): string | undefined {
  for (let d = dir; ; d = dirname(d)) {
    if (!/[\\/]node_modules([\\/]|$)/.test(d)) {
      const name = readName(join(d, "package.json"));
      if (name) return name;
    }
    if (dirname(d) === d) return undefined;
  }
}

function readName(file: string): string | undefined {
  try {
    const name = (JSON.parse(readFileSync(file, "utf8")) as { name?: unknown }).name;
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** `service.name` from OTEL_RESOURCE_ATTRIBUTES ("service.name=orders,team=shop"). */
function resourceServiceName(env: Env): string | undefined {
  for (const pair of (env.OTEL_RESOURCE_ATTRIBUTES ?? "").split(",")) {
    const [key, ...rest] = pair.split("=");
    if (key?.trim() === "service.name" && rest.join("=").trim()) return decodeURIComponent(rest.join("=").trim());
  }
  return undefined;
}

/** The service name: OTEL_SERVICE_NAME, then OTEL_RESOURCE_ATTRIBUTES, then the app's package.json name (no npm scope). */
export function autoServiceName(env: Env = process.env, cwd = process.cwd(), main = process.argv[1]): string {
  const named = env.OTEL_SERVICE_NAME?.trim() || resourceServiceName(env);
  if (named) return named;
  const pkg = packageNameAbove(cwd) ?? (main ? packageNameAbove(dirname(main)) : undefined);
  return pkg?.replace(/^@[^/]+\//, "") ?? "node-app";
}

/** The auto install's options: the service name and WIZELENS_HUD. Everything else comes from the variables createWizeLens already reads. */
export function autoOptions(env: Env = process.env): WizeLensOptions {
  const hud = envFlag(env[HUD_ENV]);
  return { serviceName: autoServiceName(env), ...(hud === undefined ? {} : { hud }) };
}

/** True when `name` is listed in WIZELENS_AUTO_SKIP. */
export function skipped(name: string, env: Env = process.env): boolean {
  return (env[SKIP_ENV] ?? "").split(",").some((s) => s.trim().toLowerCase() === name);
}
