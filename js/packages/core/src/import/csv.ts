// A small CSV reader: commas or tabs, quoted fields, doubled quotes, and any line ending.

/** The cells of each line. Blank lines are left out; a byte order mark at the start is dropped. */
export function readCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const sep = guessSeparator(src);
  const lines: string[][] = [];
  let line: string[] = [];
  let cell = "";
  let quoted = false;
  const endCell = () => (line.push(cell), (cell = ""));
  const endLine = () => (endCell(), line.some((c) => c.trim() !== "") && lines.push(line), (line = []));
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (src[i + 1] === '"') (cell += '"'), i++;
      else quoted = false;
    } else if (ch === '"' && cell.trim() === "") (cell = ""), (quoted = true);
    else if (ch === sep) endCell();
    else if (ch === "\n" || ch === "\r") (src[i + 1] === "\n" && ch === "\r" && i++, endLine());
    else cell += ch;
  }
  endLine();
  return lines;
}

/** Tabs when the first line has a tab (a sheet pasted as text), else commas. */
function guessSeparator(text: string): string {
  const first = text.slice(0, text.search(/\r|\n/) >>> 0);
  return first.includes("\t") ? "\t" : ",";
}
