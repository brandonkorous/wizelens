// CSV files built in the browser: nothing is sent anywhere.
export type Cell = string | number | boolean | null | undefined;
export type CsvColumns<T> = readonly (readonly [name: string, get: (row: T) => Cell])[];

/** One CSV field. Quotes it when it holds a comma, a quote, or a line break. */
function field(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(columns: CsvColumns<T>, rows: readonly T[]): string {
  const head = columns.map(([name]) => name).join(",");
  const body = rows.map((r) => columns.map(([, get]) => field(get(r))).join(","));
  return [head, ...body].join("\r\n");
}

/** Rows of cells as CSV text, for example a sheet read from Excel. */
export const rowsToCsv = (rows: readonly (readonly Cell[])[]): string => rows.map((r) => r.map(field).join(",")).join("\r\n");

export const isoTime = (ms: number | null | undefined): string => (ms ? new Date(ms).toISOString() : "");
export const round2 = (ms: number | null | undefined): number | null => (ms === null || ms === undefined ? null : Math.round(ms * 100) / 100);

/** Save text as `wizelens-<what>-<time>.csv`. */
export const downloadCsv = (what: string, text: string): void => downloadText(what, "csv", text, "text/csv;charset=utf-8");

/** Save text as `wizelens-<what>-<time>.<ext>`, made in the browser. */
export function downloadText(what: string, ext: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wizelens-${what}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV of plain objects: every field that holds text, a number, or a list (joined by spaces); nested objects are left out. */
export function objectsToCsv(rows: readonly object[]): string {
  const keys = [...new Set(rows.flatMap((r) => Object.entries(r).filter(([, v]) => v === null || typeof v !== "object" || Array.isArray(v)).map(([k]) => k)))];
  const cell = (v: unknown): Cell => (Array.isArray(v) ? v.join(" ") : (v as Cell));
  return toCsv(keys.map((k) => [k, (r: object) => cell((r as Record<string, unknown>)[k])] as const), rows);
}
