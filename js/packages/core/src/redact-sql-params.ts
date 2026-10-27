// Which column each positional SQL parameter ($1, ?) is bound to, so its value can be redacted by that column's name.

/** Column names whose values are never kept in SQL parameters, besides the redact keys: personal data. */
export const SQL_PARAM_KEYS: readonly string[] = ["email"];

const bare = (ident: string): string => ident.replace(/"/g, "").split(".").pop()!.trim();

/** `?` and `%s` placeholders numbered as `$1`, `$2`…, so one parser reads every style. Text in quotes is left alone. */
function numbered(sql: string): string {
  if (/\$\d/.test(sql)) return sql;
  let n = 0;
  return sql.replace(/'(?:[^']|'')*'|\?|%s/g, (m) => (m[0] === "'" ? m : `$${++n}`));
}

/** Columns of `insert into t (a, b) values ($1, default, $2)`, by parameter. */
function insertColumns(sql: string, out: Map<number, string>): void {
  const m = /insert\s+into\s+[\w".]+\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/i.exec(sql);
  if (!m) return;
  const cols = m[1]!.split(",").map(bare);
  m[2]!.split(",").forEach((v, i) => {
    const p = /\$(\d+)/.exec(v);
    if (p && cols[i]) out.set(Number(p[1]) - 1, cols[i]!);
  });
}

/** The column each parameter is compared with or set to, by zero-based position: `"t"."token" = $1` gives 0 → token. */
export function paramColumns(sql: string): Map<number, string> {
  const text = numbered(sql);
  const out = new Map<number, string>();
  const re = /([\w"]+)\s*(?:=|!=|<>|<=|>=|<|>|\s(?:i?like|in)\s*\(?)\s*\$(\d+)/gi;
  for (const m of text.matchAll(re)) out.set(Number(m[2]) - 1, bare(m[1]!));
  insertColumns(text, out);
  return out;
}
