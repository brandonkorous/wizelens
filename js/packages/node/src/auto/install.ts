import { isMainThread } from "node:worker_threads";
import { isEnabled } from "../mode.js";
import { autoOptions } from "./config.js";
import { hookFrameworks } from "./frameworks.js";
import { hookServers } from "./http.js";
import { hookLibraries } from "./libraries.js";
import { installModuleHooks } from "./module-hooks.js";
import { configureAuto, handOver } from "./owner.js";
import { claimAuto } from "./state.js";

/** What the auto install did: "on", or why it stayed off. */
export type AutoResult = "on" | "off" | "worker" | "taken";

/** Install WizeLens with no app code: hook servers, frameworks, and libraries as the app loads them. Driven by variables only. */
export function installAuto(env: Record<string, string | undefined> = process.env): AutoResult {
  if (!isMainThread) return "worker";
  const options = autoOptions(env);
  if (!isEnabled(options)) return "off";
  if (!claimAuto({ codeInstall: handOver })) return "taken";
  configureAuto(options);
  hookServers();
  hookFrameworks();
  hookLibraries();
  installModuleHooks();
  return "on";
}
