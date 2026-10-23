// Importing projects from a file: send the rows in parts, and save the new keys as CSV or JSON. The secrets stay in this browser.
import { MAX_IMPORT_REQUEST, type ProjectImportRow } from "@wizeworks/lens-core";
import { apiSend } from "../../data/api";
import { type CsvColumns, downloadCsv, downloadText, toCsv } from "../../data/csv";

/** One key the server made. `token` is the secret, sent this once. */
export interface ImportedKey {
  projectId: string;
  projectName: string;
  slug: string;
  newProject: boolean;
  keyId: string;
  kind: "ingest" | "browser";
  keyName: string;
  prefix: string;
  token: string;
  origins: string[] | null;
}

/** What a run made, and, when a part failed, why and the rows not made. */
export interface ImportRun {
  keys: ImportedKey[];
  error: string | null;
  left: ProjectImportRow[];
}

/** Where each kind of secret goes, for the file. */
const SET_AS: Record<ImportedKey["kind"], string> = { ingest: "WIZELENS_HUB_TOKEN", browser: "page code (public)" };

const KEY_COLUMNS: CsvColumns<ImportedKey> = [
  ["project", (k) => k.projectName],
  ["project_id", (k) => k.projectId],
  ["new_project", (k) => (k.newProject ? "yes" : "no")],
  ["kind", (k) => k.kind],
  ["key_name", (k) => k.keyName],
  ["key_id", (k) => k.keyId],
  ["key", (k) => k.token],
  ["set_as", (k) => SET_AS[k.kind]],
  ["sites", (k) => k.origins?.join(" ")],
];

const ROW_COLUMNS: CsvColumns<ProjectImportRow> = [
  ["name", (r) => r.name],
  ["kind", (r) => r.kind],
  ["sites", (r) => r.sites.join(" ")],
  ["key name", (r) => r.keyName],
];

export const keysCsv = (keys: readonly ImportedKey[]): string => toCsv(KEY_COLUMNS, keys);
export const saveKeysCsv = (keys: readonly ImportedKey[]) => downloadCsv("keys", keysCsv(keys));
export const saveKeysJson = (keys: readonly ImportedKey[]) => downloadText("keys", "json", JSON.stringify(keys, null, 2), "application/json");
export const saveLeftRows = (rows: readonly ProjectImportRow[]) => downloadCsv("projects-not-made", toCsv(ROW_COLUMNS, rows));

/** A file to start from: every column, a project with two services, and a browser row. */
export const saveSample = () =>
  downloadCsv("projects-sample", "name,kind,sites,key name\r\nOrders,ingest,,orders-api\r\nOrders,ingest,,orders-worker\r\nShop web,browser,https://shop.example.com https://www.example.com,shop-pages");

const bodyOf = (r: ProjectImportRow) => ({ name: r.name, kind: r.kind, sites: r.sites, keyName: r.keyName });

/** Send the rows in parts, one after another. Each part is all or nothing; a failure stops the rest. */
export async function runImport(orgId: string, rows: readonly ProjectImportRow[], expiresInDays: number | null, progress: (done: number) => void): Promise<ImportRun> {
  const keys: ImportedKey[] = [];
  for (let i = 0; i < rows.length; i += MAX_IMPORT_REQUEST) {
    const part = rows.slice(i, i + MAX_IMPORT_REQUEST);
    try {
      const res = await apiSend<{ keys: ImportedKey[] }>("POST", `./api/orgs/${orgId}/projects/import`, { projects: part.map(bodyOf), expiresInDays });
      keys.push(...res.keys);
      progress(keys.length);
    } catch (err) {
      return { keys, error: err instanceof Error ? err.message : String(err), left: rows.slice(i) };
    }
  }
  return { keys, error: null, left: [] };
}
