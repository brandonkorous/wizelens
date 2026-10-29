import { type MouseEvent, useState } from "react";
import { paramColumns } from "@wizeworks/lens-core";

/** Past this many characters a query folds to its first lines until opened. */
const LONG = 360;

/** A query's text; a long one shows its first lines and a button to open the rest. */
export function SqlText({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false);
  const long = sql.length > LONG;
  const flip = (e: MouseEvent) => (e.stopPropagation(), setOpen(!open));
  return (
    <>
      <pre className={`wl-code wl-sql${long && !open ? " wl-sql-folded" : ""}`}>{sql}</pre>
      {long && (
        <button type="button" className="wl-link-btn wl-sql-more" aria-expanded={open} onClick={flip}>
          {open ? "Show less" : "Show the whole query"}
        </button>
      )}
    </>
  );
}

/** The parameter pairs of `wizelens.db.parameters`, or null when the text is not JSON. */
function pairsOf(raw: string): [string, unknown][] | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v)) return v.map((x, i) => [String(i), x]);
    if (v && typeof v === "object") return Object.entries(v);
  } catch {
    return null;
  }
  return null;
}

const shown = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/** A query's parameters: each name, the column it is compared with or written to, and its value. */
export function SqlParams({ raw, sql }: { raw: string; sql: string }) {
  const pairs = pairsOf(raw);
  if (!pairs) return <div className="wl-sql-params wl-mono">Parameters: {raw}</div>;
  if (pairs.length === 0) return null;
  const columns = paramColumns(sql);
  return (
    <dl className="wl-sql-params">
      {pairs.map(([name, value]) => {
        const column = columns.get(name.replace(/^[@:$]/, ""));
        return (
          <div key={name}>
            <dt className="wl-mono">{name}{column && <span> · {column}</span>}</dt>
            <dd className="wl-mono">{shown(value)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
