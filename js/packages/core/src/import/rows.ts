// Rows of named fields from a pasted list, CSV (with or without a header), or JSON (a list of strings or objects).
import { readCsv } from "./csv.js";

export type RawRow = Record<string, unknown> & { row: number };

/** How a file's columns map to fields: header words (lowercase) to a field, and the field order when there is no header. */
export interface RowShape {
  headers: Record<string, string>;
  order: string[];
}

function fromCsv(text: string, shape: RowShape): RawRow[] {
  const lines = readCsv(text);
  const head = lines[0]!.map((c) => shape.headers[c.trim().toLowerCase()]);
  const hasHeader = head.includes(shape.order[0]!);
  const fields = hasHeader ? head : shape.order;
  return (hasHeader ? lines.slice(1) : lines).map((cells, i) => ({ row: i + 1, ...Object.fromEntries(fields.flatMap((f, j) => (f ? [[f, (cells[j] ?? "").trim()]] : []))) }));
}

function fromJson(text: string, shape: RowShape): RawRow[] | string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "The file starts like JSON but is not valid JSON.";
  }
  const list = Array.isArray(value) ? value : Object.values((value ?? {}) as object).find(Array.isArray);
  if (!Array.isArray(list)) return "JSON must be a list.";
  return list.map((item, i) => {
    if (typeof item === "string") return { row: i + 1, [shape.order[0]!]: item };
    const o = Object.entries((item ?? {}) as Record<string, unknown>).flatMap(([k, v]) => {
      const f = shape.headers[k.toLowerCase()] ?? (shape.order.includes(k) ? k : undefined);
      return f ? [[f, v]] : [];
    });
    return { row: i + 1, ...Object.fromEntries(o) };
  });
}

/** Every row of `text` as named fields; a message when the file cannot be read at all. */
export function readRows(text: string, shape: RowShape): RawRow[] | string {
  const trimmed = text.trim();
  if (!trimmed) return "The file is empty.";
  return /^[[{]/.test(trimmed) ? fromJson(trimmed, shape) : fromCsv(trimmed, shape);
}
