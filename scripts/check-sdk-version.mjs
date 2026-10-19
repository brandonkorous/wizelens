#!/usr/bin/env node
// Checks that a release tag (python/v0.1.0a1, java/v0.1.0-alpha.1) matches the version in that SDK's build file.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = {
  python: ["python/pyproject.toml", /^version\s*=\s*"([^"]+)"/m],
  java: ["java/pom.xml", /<artifactId>wizelens<\/artifactId>\s*<version>([^<]+)<\/version>/],
};

const tag = process.argv[2] ?? "";
const m = /^(python|java)\/v(.+)$/.exec(tag);
if (!m) {
  console.error(`check-sdk-version: "${tag}" is not a python/v* or java/v* tag`);
  process.exit(1);
}
const [, lang, version] = m;
const [file, pattern] = SOURCES[lang];
const found = pattern.exec(readFileSync(join(ROOT, file), "utf8"))?.[1] ?? "(none)";
console.log(`${found === version ? "ok " : "BAD"} ${file} ${found}`);
if (found !== version) {
  console.error(`check-sdk-version: ${file} is at ${found}, the tag says ${version}`);
  process.exit(1);
}
