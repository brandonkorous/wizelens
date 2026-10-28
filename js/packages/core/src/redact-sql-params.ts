// Which column each SQL parameter is bound to, so its value can be redacted by that column's name.

/** Column names whose values are never kept in SQL parameters, besides the redact keys: personal data, and ASP.NET Identity's SecurityStamp (it signs a user's sign-in cookies). */
export const SQL_PARAM_KEYS: readonly string[] = ["email", "securitystamp", "security_stamp"];

const bare = (ident: string): string => ident.replace(/[`"[\]]/g, "").split(".").pop()!.trim();

// One placeholder: $1, @name, :name (not a :: cast), %(name)s; `?` and `%s` are numbered first.
const PLACEHOLDER = String.raw`(?:\$(\d+)|(?<![:\w])[@:]([A-Za-z_]\w*)|%\((\w+)\)s)`;

/** The key a placeholder match stands for: "0" for $1 (zero-based), else its name. */
const keyOf = (m: RegExpMatchArray, at: number): string => (m[at] ? String(Number(m[at]) - 1) : (m[at + 1] ?? m[at + 2])!);

/** Quoted text emptied, `::type` casts dropped, and `?` and `%s` numbered as `$1`, `$2`…, so one parser reads every style. */
function normalized(sql: string): string {
  const text = sql.replace(/'(?:[^']|'')*'/g, "''").replace(/::\w+/g, "");
  if (/\$\d/.test(text)) return text;
  let n = 0;
  return text.replace(/\?|%s/g, () => `$${++n}`);
}

/** Columns of `insert into t (a, b) values ($1, default, @b)`, by parameter key. */
function insertColumns(sql: string, out: Map<string, string>): void {
  const m = /insert\s+into\s+[\w".`[\]]+\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/i.exec(sql);
  if (!m) return;
  const cols = m[1]!.split(",").map(bare);
  m[2]!.split(",").forEach((v, i) => {
    const p = new RegExp(PLACEHOLDER).exec(v.trim());
    if (p && cols[i]) out.set(keyOf(p, 1), cols[i]!);
  });
}

/** The column each parameter is compared with or set to, by position ("0" for `$1`, `?`, `%s`) or name: `"t"."token" = $1` gives "0" → token. */
export function paramColumns(sql: string): Map<string, string> {
  const text = normalized(sql);
  const out = new Map<string, string>();
  const re = new RegExp(String.raw`([\w"\`\]]+)\s*(?:=|!=|<>|<=|>=|<|>|\s(?:i?like|in)\s*\(?)\s*` + PLACEHOLDER, "gi");
  for (const m of text.matchAll(re)) out.set(keyOf(m, 2), bare(m[1]!));
  insertColumns(text, out);
  return out;
}
