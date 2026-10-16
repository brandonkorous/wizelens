#!/usr/bin/env node
import { createHub, HUB_VERSION } from "./hub.js";
import { optionsFromArgs, USAGE } from "./cli-args.js";
import { importAddonFile } from "./import.js";
import { DEFAULT_STORAGE_PATH } from "./options.js";

async function main(): Promise<void> {
  const options = optionsFromArgs(process.argv.slice(2), process.env);
  if (options === "help") return void process.stdout.write(USAGE);
  const open = options.host === "0.0.0.0" || options.host === "::";
  if (open && !options.token) console.warn("[wizelens-hub] Warning: the hub is open to the network without a token. Set --token.");
  const hub = createHub(options);
  for (const file of options.imports) console.info(`[wizelens-hub] Imported ${importAddonFile(hub.data, file)} traces from ${file}`);
  const url = await hub.listen();
  const lines = [
    `WizeLens hub ${HUB_VERSION}`,
    `  Dashboard   ${url}/_wizelens/`,
    `  Add-ons     WIZELENS_HUB=${url}`,
    `  OTLP/HTTP   OTEL_EXPORTER_OTLP_ENDPOINT=${url}`,
    `  Data        ${options.storagePath ?? DEFAULT_STORAGE_PATH}`,
  ];
  if (options.enableMcp) lines.push(`  MCP         ${url}/_wizelens/mcp`);
  console.info(lines.join("\n"));
  const stop = () => void hub.close().then(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((err: unknown) => {
  console.error(`[wizelens-hub] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
