// A list of projects to make at once, with a sending key per row (a project may have many): read from CSV, a sheet pasted as text, plain names, or JSON.
import { readCsv } from "./csv.js";

export type ImportKind = "ingest" | "browser";

/** One sending key to make, and the project (found or made by name) it sends to. */
export interface ProjectImportRow {
  /** The row in the file, counting from 1 after any header. */
  row: number;
  name: string;
  kind: ImportKind;
  /** The key's name; the project's name when the file leaves it out. */
  keyName: string;
  /** Browser keys: the sites whose pages may send with it. */
  sites: string[];
}

export interface ImportProblem {
  row: number;
  message: string;
}

export interface ProjectImport {
  rows: ProjectImportRow[];
  problems: ImportProblem[];
}

/** The most rows one file may hold, and the most one request to the server may hold. */
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_REQUEST = 500;
const MAX_NAME = 100;

type Field = "name" | "kind" | "sites" | "keyName";
const HEADERS: Record<string, Field> = { name: "name", project: "name", "project name": "name", kind: "kind", type: "kind", "key kind": "kind", sites: "sites", site: "sites", origins: "sites", "key name": "keyName", key: "keyName", keyname: "keyName" };
const NO_HEADER: Field[] = ["name", "kind", "sites", "keyName"];
const KINDS: Record<string, ImportKind> = { "": "ingest", ingest: "ingest", server: "ingest", app: "ingest", browser: "browser", site: "browser", web: "browser" };
const SITE = /^https?:\/\/(\*\.)?[^/\s*]+\/?$/i;

/** The sites in one cell or list: spaces, commas, or semicolons between them. */
export const sitesOf = (raw: unknown): string[] =>
  (Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(/[\s,;]+/) : []).map((s) => s.trim()).filter(Boolean);

/** Rows and what is wrong with any of them. Nothing is made while there is a problem. */
export function parseProjectImport(text: string): ProjectImport {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], problems: [{ row: 0, message: "The file is empty." }] };
  const raw = /^[[{]/.test(trimmed) ? fromJson(trimmed) : fromCsv(trimmed);
  if ("message" in raw) return { rows: [], problems: [{ row: 0, message: raw.message }] };
  return checkRows(raw.map((r, i) => ({ ...r, row: i + 1 })));
}

/** The same checks for a list already in JSON: names, or objects with name, kind, sites, and keyName. */
export const checkProjectList = (list: readonly unknown[]): ProjectImport => checkRows(list.map((item, i) => ({ ...fieldsOf(item), row: i + 1 })));

type Raw = Partial<Record<Field, unknown>>;

function fromCsv(text: string): Raw[] {
  const lines = readCsv(text);
  const head = lines[0]!.map((c) => HEADERS[c.trim().toLowerCase()]);
  const hasHeader = head.includes("name");
  const fields = hasHeader ? head : NO_HEADER;
  return (hasHeader ? lines.slice(1) : lines).map((cells) => Object.fromEntries(fields.flatMap((f, i) => (f ? [[f, cells[i] ?? ""]] : []))));
}

function fromJson(text: string): Raw[] | { message: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { message: "The file starts like JSON but is not valid JSON." };
  }
  const list = Array.isArray(value) ? value : (value as { projects?: unknown }).projects;
  if (!Array.isArray(list)) return { message: 'JSON must be a list of projects, or { "projects": [...] }.' };
  return list.map(fieldsOf);
}

function fieldsOf(item: unknown): Raw {
  if (typeof item === "string") return { name: item };
  const o = (item ?? {}) as Record<string, unknown>;
  return { name: o.name ?? o.project, kind: o.kind, sites: o.sites ?? o.origins, keyName: o.keyName ?? o.key };
}

/** One row, checked. A message when it is not usable. */
function rowOf(r: Raw & { row: number }): ProjectImportRow | string {
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const kind = KINDS[String(r.kind ?? "").trim().toLowerCase()];
  const keyName = typeof r.keyName === "string" && r.keyName.trim() ? r.keyName.trim() : name;
  const sites = sitesOf(r.sites);
  if (!name) return "It has no project name.";
  if (name.length > MAX_NAME || keyName.length > MAX_NAME) return `Names are up to ${MAX_NAME} characters.`;
  if (!kind) return `Kind "${String(r.kind)}" is not ingest or browser.`;
  if (kind === "browser" && sites.length === 0) return "A browser key needs the sites that may send with it, like https://shop.example.com.";
  const bad = sites.find((s) => !SITE.test(s));
  if (kind === "browser" && bad) return `"${bad}" is not a site. Use the scheme and host only, like https://shop.example.com.`;
  return { row: r.row, name, kind, keyName, sites: kind === "browser" ? sites : [] };
}

function checkRows(raw: (Raw & { row: number })[]): ProjectImport {
  const rows: ProjectImportRow[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Map<string, number>();
  if (raw.length > MAX_IMPORT_ROWS) problems.push({ row: 0, message: `A file holds up to ${MAX_IMPORT_ROWS} rows; this one has ${raw.length}. Split it.` });
  for (const r of raw.slice(0, MAX_IMPORT_ROWS)) {
    const out = rowOf(r);
    if (typeof out === "string") {
      problems.push({ row: r.row, message: out });
      continue;
    }
    const id = `${out.name}\n${out.keyName}`.toLowerCase();
    const first = seen.get(id);
    if (first !== undefined) problems.push({ row: r.row, message: `"${out.name}" already has a key named "${out.keyName}" on row ${first}. Give each of its keys its own key name.` });
    else (seen.set(id, r.row), rows.push(out));
  }
  return { rows, problems };
}
