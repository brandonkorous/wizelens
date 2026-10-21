#!/usr/bin/env node
// Gets a v* release ready: one version everywhere, and "## [Unreleased]" in CHANGELOG.md becomes that version.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2]?.replace(/^v/, "");

function fail(message) {
  console.error(`release-prep: ${message}`);
  process.exit(1);
}

// Replaces one match in a file, and fails when the pattern is not there.
function edit(path, pattern, replace) {
  const file = join(ROOT, path);
  const text = readFileSync(file, "utf8");
  if (!pattern.test(text)) fail(`${path}: no ${pattern} to change`);
  writeFileSync(file, text.replace(pattern, replace));
  console.log(`ok  ${path}`);
}

// Renames the Unreleased section to the version, keeping its title, such as "Security from real traffic".
function changelog() {
  const file = join(ROOT, "CHANGELOG.md");
  const text = readFileSync(file, "utf8");
  if (text.includes(`## [${version}]`)) fail(`CHANGELOG.md already has ## [${version}]`);
  const match = /^## \[Unreleased\](?:\s*[—-]\s*(.*))?$/m.exec(text);
  if (!match) fail('CHANGELOG.md has no "## [Unreleased]" section');
  const title = match[1]?.trim();
  if (!title) fail('give the release a title first: "## [Unreleased] — What it is about"');
  const body = text.slice(match.index + match[0].length).split(/\n## \[/)[0];
  if (!/^- /m.test(body)) fail("the Unreleased section has no entries");
  writeFileSync(file, text.replace(match[0], `## [${version}] — ${title}`));
  console.log("ok  CHANGELOG.md");
}

function packages() {
  for (const name of readdirSync(join(ROOT, "js", "packages"))) {
    edit(`js/packages/${name}/package.json`, /"version": "[^"]+"/, `"version": "${version}"`);
  }
  edit("dotnet/Directory.Build.props", /<Version>[^<]+<\/Version>/, `<Version>${version}</Version>`);
  edit("deploy/inject/chart/Chart.yaml", /^version: .+$/m, `version: ${version}`);
  edit("deploy/inject/chart/Chart.yaml", /^appVersion: .+$/m, `appVersion: "${version}"`);
}

function main() {
  if (!version || !/^\d+\.\d+\.\d+(-[0-9a-z.]+)?$/i.test(version)) fail("usage: pnpm release:prep 0.3.0-alpha.8");
  changelog();
  packages();
  console.log(`\nrelease-prep: ready for v${version}. Next: pnpm install, commit, merge, then tag v${version} on main.`);
}

main();
