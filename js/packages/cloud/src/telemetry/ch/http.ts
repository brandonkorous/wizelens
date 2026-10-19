// A small ClickHouse client over its HTTP interface: queries with typed parameters, commands, and JSON-rows inserts.

export interface ChOptions {
  /** `http(s)://user:password@host:8123/database`. */
  url: string;
  /** Per call. Default 30 s. */
  timeoutMs?: number;
}

export interface ChClient {
  readonly database: string;
  /** Rows of a SELECT. `params` are p1, p2, ... in order, for `{pN:Type}` placeholders. */
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** A statement without rows (DDL, DELETE, INSERT ... SELECT). */
  command(sql: string, params?: readonly unknown[], settings?: Record<string, string>): Promise<void>;
  /** Rows as JSON lines into `INSERT INTO <target> FORMAT JSONEachRow`; the target may be `t SELECT ... FROM input(...)`. */
  insert(target: string, rows: readonly object[], settings?: Record<string, string>): Promise<void>;
  ping(): Promise<boolean>;
}

/** A parameter as ClickHouse reads it from the URL: arrays as ClickHouse literals, null as \N. */
function paramText(v: unknown): string {
  if (v === null || v === undefined) return "\\N";
  if (Array.isArray(v)) return `[${v.map((x) => (typeof x === "number" ? String(x) : `'${String(x).replace(/[\\']/g, (c) => `\\${c}`)}'`)).join(",")}]`;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

interface Endpoint {
  base: string;
  headers: Record<string, string>;
  database: string;
}

function endpointOf(url: string): Endpoint {
  const u = new URL(url);
  const database = decodeURIComponent(u.pathname.replace(/^\//, "")) || "default";
  const headers: Record<string, string> = { "X-ClickHouse-User": decodeURIComponent(u.username || "default"), "X-ClickHouse-Database": database };
  if (u.password) headers["X-ClickHouse-Key"] = decodeURIComponent(u.password);
  return { base: `${u.protocol}//${u.host}/`, headers, database };
}

// Column statistics stay off: they gave nothing here, and one read failed with UNKNOWN_CODEC while loading them under load.
const SETTINGS = {
  prefer_column_name_to_alias: "1", output_format_json_quote_64bit_integers: "0", output_format_json_quote_denormals: "0", date_time_output_format: "iso",
  use_statistics: "0", use_statistics_for_part_pruning: "0", allow_statistics_optimize: "0",
};

const refused = (err: unknown) => (err as { cause?: { code?: string } }).cause?.code === "ECONNREFUSED";

/** One fetch with a timer that is always cleared, so no timer outlives the call. */
async function fetchOnce(url: string, init: RequestInit, timeoutMs: number): Promise<{ status: number; ok: boolean; text: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error(`ClickHouse did not answer in ${timeoutMs} ms`)), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

/** A refused connection never reached the server, so even an insert is safe to send again. */
async function send(url: string, init: RequestInit, timeoutMs: number): Promise<{ status: number; ok: boolean; text: string }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(url, init, timeoutMs);
    } catch (err) {
      if (!refused(err) || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
}

async function call(e: Endpoint, body: string, query: Record<string, string>, timeoutMs: number): Promise<string> {
  const qs = new URLSearchParams({ ...SETTINGS, ...query });
  const res = await send(`${e.base}?${qs.toString()}`, { method: "POST", headers: e.headers, body }, timeoutMs);
  if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${res.text.slice(0, 500)}`);
  return res.text;
}

const paramsOf = (params: readonly unknown[]) => Object.fromEntries(params.map((v, i) => [`param_p${i + 1}`, paramText(v)]));

/** A client for one database. Nothing connects until the first call. */
export function chClient(o: ChOptions): ChClient {
  const e = endpointOf(o.url);
  const timeout = o.timeoutMs ?? 30_000;
  return {
    database: e.database,
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const text = await call(e, `${sql}\nFORMAT JSONEachRow`, paramsOf(params), timeout);
      return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
    },
    async command(sql, params = [], settings = {}) {
      await call(e, sql, { ...paramsOf(params), ...settings }, timeout);
    },
    async insert(target, rows, settings = {}) {
      if (rows.length === 0) return;
      const body = rows.map((r) => JSON.stringify(r)).join("\n");
      await call(e, body, { query: `INSERT INTO ${target} FORMAT JSONEachRow`, ...settings }, timeout);
    },
    async ping() {
      try {
        return (await fetchOnce(`${e.base}ping`, {}, 5_000)).ok;
      } catch {
        return false;
      }
    },
  };
}
