#!/usr/bin/env node
// Fails a pull request that changes what people use but leaves CHANGELOG.md as it was.
import { execFileSync } from "node:child_process";

const BASE = process.env.CHANGELOG_BASE || "origin/main";
const SKIP_LABEL = "no changelog";
const LABELS = (process.env.CHANGELOG_LABELS ?? "").split(",").map((l) => l.trim().toLowerCase());

// Paths people get in a package, an image, the cloud, or the site.
const PRODUCT = [/^js\/packages\//, /^dotnet\/src\//, /^go\/(?!.*_test\.go$)/, /^java\/.*\/src\/main\//, /^python\/src\//, /^site\/(src|content)\//, /^deploy\//];
// Tests and fixtures change nothing people use.
const NOT_PRODUCT = [/\.test\.(ts|tsx|mjs)$/, /\/testing\//, /\/__tests__\//, /\/tests?\//];

const isProduct = (path) => PRODUCT.some((r) => r.test(path)) && !NOT_PRODUCT.some((r) => r.test(path));

function changedFiles() {
  const out = execFileSync("git", ["diff", "--name-only", `${BASE}...HEAD`], { encoding: "utf8" });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function main() {
  if (LABELS.includes(SKIP_LABEL)) return console.log(`check-changelog: skipped (label "${SKIP_LABEL}")`);
  const files = changedFiles();
  const product = files.filter(isProduct);
  if (product.length === 0) return console.log("check-changelog: no product changes");
  if (files.includes("CHANGELOG.md")) return console.log("check-changelog: CHANGELOG.md is updated");
  console.error("check-changelog: this change touches the product but not CHANGELOG.md.");
  console.error(`Add a line under "## [Unreleased]", or add the label "${SKIP_LABEL}" if people will not notice it.`);
  for (const f of product.slice(0, 15)) console.error(`  ${f}`);
  if (product.length > 15) console.error(`  ...and ${product.length - 15} more`);
  process.exit(1);
}

main();
