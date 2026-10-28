import { Fragment, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { type PageInfo, slicePage } from "@wizeworks/lens-core";
import { setQuery } from "../routes";
import { Pager } from "./Controls";
import { sortQuery, type TablePaging, urlPaging, useTablePaging } from "./paging";
import { pressable } from "./pressable";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Right-aligned numbers. */
  num?: boolean;
  className?: string;
  /** Makes the column sortable by this value. */
  sort?: (row: T) => number | string;
  /** Hidden on a phone, where another cell repeats what it holds. */
  hideSm?: boolean;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  empty?: ReactNode;
  /** Initial sort column and direction. */
  defaultSort?: { key: string; desc: boolean };
  /** Shown in a full-width row under the selected row, for example a log line's attributes. */
  detail?: (row: T) => ReactNode;
  /** Tick boxes for picking rows to act on together; the header box picks every row shown. */
  select?: TableSelect;
  /** Pages in the browser, with the shared pager under the table. */
  paging?: TablePaging;
  /** Sorted and paged by the server: `rows` is the page it sent. Header clicks and page buttons go to the URL. */
  served?: { info: PageInfo; noun: string };
}

export interface TableSelect {
  picked: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** What one row is, for the boxes' labels, for example "key". */
  noun: string;
  /** Rows with no box, for example your own row among members. */
  pickable?: (key: string) => boolean;
}

/** A tick box that can also show "some" (indeterminate). */
function PickBox({ checked, some = false, label, onChange }: { checked: boolean; some?: boolean; label: string; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => void (ref.current && (ref.current.indeterminate = some && !checked)), [some, checked]);
  return (
    <label className="wl-pick-hit" onClick={(e) => e.stopPropagation()}>
      <input ref={ref} type="checkbox" className="wl-pick" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** The header box: every row shown, some, or none. */
function PickAll({ keys, select }: { keys: string[]; select: TableSelect }) {
  const on = keys.filter((k) => select.picked.has(k)).length;
  const all = keys.length > 0 && on === keys.length;
  const change = (pick: boolean) => {
    const next = new Set(select.picked);
    for (const k of keys) if (pick) next.add(k); else next.delete(k);
    select.onChange(next);
  };
  if (keys.length === 0) return <th className="wl-cell-pick" />;
  return <th className="wl-cell-pick"><PickBox checked={all} some={on > 0} label={`Select every ${select.noun} shown`} onChange={change} /></th>;
}

function PickOne({ id, select }: { id: string; select: TableSelect }) {
  if (select.pickable && !select.pickable(id)) return <td className="wl-cell-pick" />;
  const change = (pick: boolean) => {
    const next = new Set(select.picked);
    if (pick) next.add(id);
    else next.delete(id);
    select.onChange(next);
  };
  // A click near the box picks too, and never opens the row.
  const near = (e: MouseEvent) => (e.stopPropagation(), change(!select.picked.has(id)));
  return <td className="wl-cell-pick" onClick={near}><PickBox checked={select.picked.has(id)} label={`Select this ${select.noun}`} onChange={change} /></td>;
}

function useSorted<T>(rows: readonly T[], columns: Column<T>[], sort: { key: string; desc: boolean } | null): readonly T[] {
  return useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!sort || !col?.sort) return rows;
    const get = col.sort;
    const dir = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [rows, columns, sort]);
}

function HeaderCell<T>({ col, sort, onSort }: { col: Column<T>; sort: { key: string; desc: boolean } | null; onSort: (key: string) => void }) {
  const cls = [col.num ? "wl-num" : "", col.hideSm ? "wl-hide-sm" : ""].join(" ").trim() || undefined;
  if (!col.sort) return <th className={cls}>{col.header}</th>;
  const active = sort?.key === col.key;
  const Arrow = active && sort?.desc ? ArrowDown : ArrowUp;
  return (
    <th className={cls} aria-sort={active ? (sort?.desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => onSort(col.key)}>
        {col.header}
        {active && <Arrow aria-hidden="true" />}
      </button>
    </th>
  );
}

interface BodyProps<T> extends TableProps<T> {
  shown: readonly T[];
  sort: { key: string; desc: boolean } | null;
  onSort: (key: string) => void;
}

function TableBody<T>({ columns, shown, rowKey, onRowClick, selectedKey, detail, select, sort, onSort }: BodyProps<T>) {
  return (
    <div className="wl-table-wrap">
      <table className="wl-table">
        <thead>
          <tr>
            {select && <PickAll keys={shown.map(rowKey).filter((k) => select.pickable?.(k) ?? true)} select={select} />}
            {columns.map((c) => (
              <HeaderCell key={c.key} col={c} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const key = rowKey(row);
            const open = key === selectedKey;
            const cls = [onRowClick ? "wl-clickable" : "", open ? "wl-selected" : "", select?.picked.has(key) ? "wl-picked" : ""].join(" ").trim();
            return (
              <Fragment key={key}>
                <tr className={cls || undefined} {...(onRowClick ? pressable(() => onRowClick(row)) : {})}>
                  {select && <PickOne id={key} select={select} />}
                  {columns.map((c) => (
                    <td key={c.key} className={[c.num ? "wl-num" : "", c.hideSm ? "wl-hide-sm" : "", c.className ?? ""].join(" ").trim() || undefined}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
                {open && detail && (
                  <tr className="wl-row-detail">
                    <td colSpan={columns.length + (select ? 1 : 0)}>{detail(row)}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A plain data table with optional sorting, row clicks, a selected row, tick boxes, and pages. It sorts every row, then pages. */
export function Table<T>(props: TableProps<T>) {
  const { columns, rows, empty, defaultSort, paging, served } = props;
  const [own, setOwn] = useState(defaultSort ?? null);
  const sorted = useSorted(rows, columns, served ? null : own);
  const pg = useTablePaging(paging);
  const sort = served ? served.info.sort : own;
  const ownSort = (key: string) => (setOwn((s) => (s?.key === key ? { key, desc: !s.desc } : { key, desc: true })), paging && pg.onPage(1));
  const onSort = served ? (key: string) => setQuery(sortQuery(served.info, key)) : ownSort;
  if (rows.length === 0 && empty && !(served && served.info.total > 0)) return <>{empty}</>;
  const shown = paging ? slicePage(sorted, pg.page, pg.size) : { rows: sorted, page: 1 };
  return (
    <>
      <TableBody {...props} shown={shown.rows} sort={sort} onSort={onSort} />
      {paging && <Pager page={shown.page} pageSize={pg.size} total={rows.length} noun={paging.noun} onPage={pg.onPage} onPageSize={pg.onPageSize} />}
      {served && <Pager page={served.info.page} pageSize={served.info.size} total={served.info.total} noun={served.noun} {...urlPaging(served.info.key)} />}
    </>
  );
}
