#!/usr/bin/env node
// Checks that every npm package, the .NET packages, and both Helm charts carry the same version (and, with an argument, that version and its changelog section).
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

function chartVersions() {
  const read = (...path) => readFileSync(join(ROOT, "deploy", ...path, "Chart.yaml"), "utf8");
  const field = (chart, name) => new RegExp(`^${name}:\\s*"?([^"\\s]+)"?`, "m").exec(chart)?.[1] ?? "(none)";
  const inject = read("inject", "chart");
  const collector = read("helm", "wizelens-collector");
  return [
    ["wizelens-inject chart version", field(inject, "version")],
    ["wizelens-inject chart appVersion", field(inject, "appVersion")],
    ["wizelens-collector chart version", field(collector, "version")],
  ];
}

const all = [...npmVersions(), dotnetVersion(), ...chartVersions()];
const target = expected ?? all[0][1];
const wrong = all.filter(([, v]) => v !== target);
for (const [name, v] of all) console.log(`${v === target ? "ok " : "BAD"} ${name} ${v}`);
if (wrong.length > 0) {
  console.error(`check-version: ${wrong.length} package(s) are not at ${target}`);
  process.exit(1);
}
// A release tag also needs its own CHANGELOG.md section, so the site never calls a shipped release "Unreleased".
if (expected && !readFileSync(join(ROOT, "CHANGELOG.md"), "utf8").includes(`
## [${expected}]`)) {
  console.error(`check-version: CHANGELOG.md has no "## [${expected}]" section. Run pnpm release:prep ${expected} first.`);
  process.exit(1);
}
console.log(`check-version: all packages at ${target}`);
