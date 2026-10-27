import { type Attributes, REDACTED, redactParams } from "@wizeworks/lens-core";

const PARAM_PREFIX = "db.query.parameter.";
const PYTHON_PARAMS = "db.statement.parameters";
export const DB_PARAMS = "wizelens.db.parameters";

// One Python literal token: a quoted string, a word (None, True, numbers), or punctuation.
const TOKEN = /\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[A-Za-z_][\w.]*|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[()[\]{}:,])/y;
const WORDS: Record<string, string> = { None: "null", True: "true", False: "false" };

function pyString(tok: string): string {
  const body = tok.slice(1, -1).replace(/\\'/g, "'");
  return JSON.stringify(tok[0] === '"' ? JSON.parse(tok) : body.replace(/\\\\/g, "\\"));
}

/** The `str()` of a Python tuple, list, or dict (what the dbapi instrumentation sends) as JSON. Null when it is not one. */
export function pythonToJson(text: string): unknown {
  const parts: string[] = [];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while (TOKEN.lastIndex < text.length && (m = TOKEN.exec(text))) {
    const t = m[1]!;
    if (t === "(") parts.push("[");
    else if (t === ")") parts.push("]");
    else if (t[0] === "'" || t[0] === '"') parts.push(pyString(t));
    else if (/^[A-Za-z_]/.test(t)) parts.push(WORDS[t] ?? JSON.stringify(t));
    else parts.push(t);
  }
  if (text.slice(TOKEN.lastIndex).trim()) return null;
  try {
    return JSON.parse(parts.join("").replace(/,\s*([\]}])/g, "$1"));
  } catch {
    return null;
  }
}

// Agents name parameters by position ("0", "1") or by name; positions become an array.
function fromKeys(a: Attributes): Record<string, unknown> | unknown[] | null {
  const keys = Object.keys(a).filter((k) => k.startsWith(PARAM_PREFIX));
  if (keys.length === 0) return null;
  const named: Record<string, unknown> = {};
  for (const k of keys) {
    named[k.slice(PARAM_PREFIX.length)] = a[k];
    delete a[k];
  }
  const names = Object.keys(named);
  const positional = names.every((n) => /^\d+$/.test(n));
  return positional ? names.sort((x, y) => Number(x) - Number(y)).map((n) => named[n]) : named;
}

const sqlOf = (a: Attributes): string => String(a["db.query.text"] ?? a["db.statement"] ?? "");

function fromPython(a: Attributes, keys: readonly string[]): string | null {
  const raw = a[PYTHON_PARAMS];
  if (typeof raw !== "string") return null;
  delete a[PYTHON_PARAMS];
  const parsed = pythonToJson(raw);
  if (parsed !== null && typeof parsed === "object") return redactParams(parsed, keys, sqlOf(a));
  return keys.some((k) => raw.toLowerCase().includes(k)) ? REDACTED : raw;
}

/** SQL parameters from the OTel agents (`db.query.parameter.<key>`, Python's `db.statement.parameters`) as `wizelens.db.parameters`. */
export function foldDbParams(a: Attributes, keys: readonly string[]): void {
  const fromAgent = fromKeys(a);
  const python = fromPython(a, keys);
  if (a[DB_PARAMS] !== undefined) return;
  if (fromAgent) a[DB_PARAMS] = redactParams(fromAgent, keys, sqlOf(a));
  else if (python !== null) a[DB_PARAMS] = python;
}

