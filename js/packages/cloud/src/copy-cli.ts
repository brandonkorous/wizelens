import { optionsFromArgs } from "./cli-args.js";
import { resolveConfig } from "./config.js";
import { openDb } from "./db/db.js";
import { migrate } from "./db/migrate.js";
import { copyTelemetry } from "./telemetry/copy.js";
import { openTelemetry } from "./telemetry/index.js";

/** `wizelens-cloud copy-telemetry --database <postgres> --clickhouse <url>`: move existing telemetry into ClickHouse, once, before switching. */
export async function copyMain(argv: string[]): Promise<void> {
  const options = optionsFromArgs(argv, process.env);
  if (options === "help" || !options.clickhouseUrl) throw new Error("Usage: wizelens-cloud copy-telemetry --database <postgres url> --clickhouse <url>");
  const config = resolveConfig({ ...options, jobs: false });
  const db = await openDb(config.database);
  await migrate(db);
  const to = await openTelemetry(config, db);
  console.info("Copying telemetry from the database into ClickHouse...");
  const done = await copyTelemetry(db, to, config.now(), (line) => console.info(line));
  console.info(`Done: ${done.traces} traces and ${done.points} metric points. Start the cloud with --clickhouse; it settles them.`);
  await to.close();
  await db.close();
}
