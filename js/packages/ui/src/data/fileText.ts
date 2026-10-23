// A chosen file as text, read in the browser. An Excel sheet becomes CSV, so every list reader takes it like any other.
import { rowsToCsv } from "./csv";
import { readXlsx } from "./xlsx";

export async function textOfFile(file: File): Promise<string> {
  if (!/\.xlsx$/i.test(file.name)) return file.text();
  return rowsToCsv(await readXlsx(await file.arrayBuffer()));
}

/** What a list picker offers: Excel, CSV, TSV, text, and JSON. */
export const LIST_FILES = ".csv,.tsv,.txt,.json,.xlsx,text/csv,text/plain,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
