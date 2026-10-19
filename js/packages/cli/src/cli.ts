#!/usr/bin/env node
import { commandOf, USAGE } from "./cli-args.js";
import { listUploadedMaps, uploadSourceMaps } from "./upload.js";

async function main(): Promise<void> {
  const cmd = commandOf(process.argv.slice(2));
  if (cmd.kind === "help") return void process.stdout.write(USAGE);
  if (cmd.kind === "upload") return void (await uploadSourceMaps(cmd.options));
  const maps = await listUploadedMaps(cmd.options);
  for (const m of maps) console.info(`${m.release}\t${m.file}\t${m.bytes} bytes\t${new Date(m.uploadedMs).toISOString()}`);
  if (maps.length === 0) console.info("No source maps.");
}

main().catch((err: unknown) => {
  console.error(`[wizelens] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
