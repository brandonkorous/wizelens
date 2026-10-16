#!/usr/bin/env node
// Checks that every npm package and the .NET packages carry the same version (and, with an argument, that version).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const expected = process.argv[2];

function npmVersions() {
  const dir = join(ROOT, "js", "packages");
  return readdirSync(dir).map((name) => {
    const pkg = JSON.parse(readFileSync(join(dir, name, "package.json"), "utf8"));
    return [pkg.name, pkg.version];
  });
}

function dotnetVersion() {
  const props = readFileSync(join(ROOT, "dotnet", "Directory.Build.props"), "utf8");
  return ["dotnet/Directory.Build.props", /<Version>([^<]+)<\/Version>/.exec(props)?.[1] ?? "(none)"];
}

const all = [...npmVersions(), dotnetVersion()];
const target = expected ?? all[0][1];
const wrong = all.filter(([, v]) => v !== target);
for (const [name, v] of all) console.log(`${v === target ? "ok " : "BAD"} ${name} ${v}`);
if (wrong.length > 0) {
  console.error(`check-version: ${wrong.length} package(s) are not at ${target}`);
  process.exit(1);
}
console.log(`check-version: all packages at ${target}`);
