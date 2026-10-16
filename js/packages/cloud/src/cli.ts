#!/usr/bin/env node
import { optionsFromArgs, USAGE } from "./cli-args.js";
import { CLOUD_VERSION, createCloud } from "./server.js";

async function main(): Promise<void> {
  const options = optionsFromArgs(process.argv.slice(2), process.env);
  if (options === "help") return void process.stdout.write(USAGE);
  const cloud = await createCloud(options);
  const url = await cloud.listen();
  const db = cloud.app.db.kind === "postgres" ? "Postgres" : `PGlite (${cloud.app.config.database})`;
  console.info(
    [
      `WizeLens Cloud ${CLOUD_VERSION}`,
      `  Dashboard   ${url}/_wizelens/`,
      `  Add-ons     WIZELENS_HUB=${url}  WIZELENS_HUB_TOKEN=<ingest key>`,
      `  OTLP/HTTP   OTEL_EXPORTER_OTLP_ENDPOINT=${url}  (header Authorization=Bearer <ingest key>)`,
      `  Database    ${db}`,
    ].join("\n"),
  );
  if (cloud.app.db.kind === "pglite") console.info("  Note: PGlite is for trials and tests. Use Postgres for real teams.");
  const stop = () => void cloud.close().then(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((err: unknown) => {
  console.error(`[wizelens-cloud] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
