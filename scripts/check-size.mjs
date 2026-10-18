#!/usr/bin/env node
// Size rules: 250 lines per file, 50 lines per function, comments one line long.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_FILE = 250;
const MAX_FUNC = 50;
const SOURCE = /\.(ts|tsx|mjs|cs)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "bin", "obj", ".git", ".wizelens", "images"]);
const SCAN = ["js/packages", "samples", "dotnet", "scripts", "site/src"];
const CONTROL = /^(if|else|for|foreach|while|switch|catch|using|lock|fixed|do|try|finally|checked|unchecked|unsafe)\b/;
const TYPE_DECL = /(^|\s)(class|interface|enum|namespace|struct|record)\s/;
const REGEX_BEFORE = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "", "+", "-", "*", "%", "<", ">", "~", "^"]);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (SOURCE.test(name) && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

// Blanks out strings, comments and regex literals so only code structure is left.
function scanLine(line, state, isTs) {
  let out = "";
  let i = 0;
  const lastCode = () => out.trimEnd().slice(-1);
  while (i < line.length) {
    const c = line[i];
    const n = line[i + 1];
    if (state.mode === "block") {
      if (c === "*" && n === "/") { state.mode = "code"; i += 2; out += "  "; continue; }
      out += " "; i++; continue;
    }
    if (state.mode === "template") {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === "`") { state.mode = "code"; out += "`"; i++; continue; }
      out += " "; i++; continue;
    }
    if (state.mode === "raw") {
      if (line.startsWith('"""', i)) { state.mode = "code"; out += '"""'; i += 3; continue; }
      out += " "; i++; continue;
    }
    if (c === "/" && n === "/") { state.lineComment = true; break; }
    if (c === "/" && n === "*") { state.mode = "block"; state.blockStart = state.lineNo; out += "  "; i += 2; continue; }
    if (!isTs && line.startsWith('"""', i)) { state.mode = "raw"; out += '"""'; i += 3; continue; }
    if (c === "`" && isTs) { state.mode = "template"; out += "`"; i++; continue; }
    if (c === '"' || c === "'") { i = skipQuoted(line, i, c, !isTs && line[i - 1] === "@"); out += c + c; continue; }
    if (isTs && c === "/" && n !== ">" && REGEX_BEFORE.has(lastCode())) { i = skipRegex(line, i); out += "//"; continue; }
    out += c; i++;
  }
  return out;
}

function skipQuoted(line, start, quote, verbatim) {
  let i = start + 1;
  while (i < line.length) {
    if (!verbatim && line[i] === "\\") { i += 2; continue; }
    if (line[i] === quote) {
      if (verbatim && line[i + 1] === quote) { i += 2; continue; }
      return i + 1;
    }
    i++;
  }
  return i;
}

function skipRegex(line, start) {
  let i = start + 1;
  let inClass = false;
  while (i < line.length) {
    const c = line[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) return i + 1;
    i++;
  }
  return i;
}

function isFunctionHeader(header) {
  const h = header.replace(/\s+/g, " ").trim();
  if (h === "" || CONTROL.test(h) || TYPE_DECL.test(h)) return false;
  if (/=>$/.test(h) || /\bfunction\b/.test(h)) return true;
  if (/^(get|set|init|add|remove)$/.test(h.split(" ").pop() ?? "")) return true;
  return /\)\s*(:\s*[^=]*)?$/.test(h) || /\)\s*:\s*(base|this)\s*\(.*\)$/.test(h);
}

// Finds function bodies by brace matching and reports the long ones.
function checkFunctions(clean, file, report) {
  const stack = [];
  let header = "";
  let headerLine = -1;
  clean.forEach((line, lineNo) => {
    for (const c of line) {
      if (c === "{" || (c === "(" && /=>\s*$/.test(header))) {
        const fn = c === "{" ? isFunctionHeader(header) : true;
        stack.push({ fn, start: headerLine >= 0 ? headerLine : lineNo, close: c === "{" ? "}" : ")" });
        header = ""; headerLine = -1;
        continue;
      }
      const top = stack[stack.length - 1];
      if (top && c === top.close) {
        stack.pop();
        const length = lineNo - top.start + 1;
        if (top.fn && length > MAX_FUNC) report(file, top.start + 1, `function is ${length} lines (max ${MAX_FUNC})`);
        header = ""; headerLine = -1;
        continue;
      }
      if (c === ";" || c === "}") { header = ""; headerLine = -1; continue; }
      if (c.trim() && headerLine < 0) headerLine = lineNo;
      header += c;
    }
    header += " ";
  });
}

function checkFile(path, report) {
  const file = relative(ROOT, path).replaceAll("\\", "/");
  const lines = readFileSync(path, "utf8").replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  if (lines.length > MAX_FILE) report(file, 1, `file is ${lines.length} lines (max ${MAX_FILE})`);
  const isTs = !path.endsWith(".cs");
  const state = { mode: "code", lineNo: 0, blockStart: -1, lineComment: false };
  let commentRun = 0;
  const clean = lines.map((line, lineNo) => {
    state.lineNo = lineNo;
    state.lineComment = false;
    const wasBlock = state.mode === "block";
    const out = scanLine(line, state, isTs);
    if (wasBlock && state.mode !== "block") report(file, state.blockStart + 1, "comment spans more than one line");
    const onlyComment = state.lineComment && out.trim() === "";
    commentRun = onlyComment ? commentRun + 1 : 0;
    if (commentRun === 2) report(file, lineNo, "comment spans more than one line");
    return out;
  });
  checkFunctions(clean, file, report);
}

function main() {
  const problems = [];
  const report = (file, line, message) => problems.push(`${file}:${line}  ${message}`);
  for (const dir of SCAN) {
    const abs = join(ROOT, dir);
    try {
      for (const path of walk(abs, [])) checkFile(path, report);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  for (const p of problems) console.log(p);
  console.log(problems.length === 0 ? "check-size: all files pass" : `check-size: ${problems.length} problem(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
}

main();
