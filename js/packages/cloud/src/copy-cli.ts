import { optionsFromArgs } from "./cli-args.js";
import { resolveConfig } from "./config.js";
import { openDb } from "./db/db.js";
import { migrate } from "./db/migrate.js";
import { copyTelemetry } from "./telemetry/copy.js";
import { openTelemetry } from "./telemetry/index.js";

const USAGE = "Usage: wizelens-cloud copy-telemetry --database <postgres url> --clickhouse <url> [--force]";

/** `wizelens-cloud copy-telemetry`: move existing telemetry into ClickHouse, once. `--force`: also into projects ClickHouse has, after the switch. */
export async function copyMain(argv: string[]): Promise<void> {
  const force = argv.includes("--force");
  const options = optionsFromArgs(argv.filter((a) => a !== "--force"), process.env);
  if (options === "help" || !options.clickhouseUrl) throw new Error(USAGE);
  const config = resolveConfig({ ...options, jobs: false });
  const db = await openDb(config.database);
  await migrate(db);
  const to = await openTelemetry(config, db);
  console.info("Copying telemetry from the database into ClickHouse...");
  const done = await copyTelemetry(db, to, config.now(), (line) => console.info(line), force);
  console.info(`Done: ${done.traces} traces and ${done.points} metric points. Start the cloud with --clickhouse; it settles them.`);
  await to.close();
  await db.close();
}
