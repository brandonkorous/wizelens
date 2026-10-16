import { type ReactNode, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Right-aligned numbers. */
  num?: boolean;
  className?: string;
  /** Makes the column sortable by this value. */
  sort?: (row: T) => number | string;
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
  const cls = col.num ? "wl-num" : undefined;
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

/** A plain data table with optional sorting, row clicks, and a selected row. */
export function Table<T>({ columns, rows, rowKey, onRowClick, selectedKey, empty, defaultSort }: TableProps<T>) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const sorted = useSorted(rows, columns, sort);
  const onSort = (key: string) => setSort((s) => (s?.key === key ? { key, desc: !s.desc } : { key, desc: true }));
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="wl-table-wrap">
      <table className="wl-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <HeaderCell key={c.key} col={c} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            const cls = [onRowClick ? "wl-clickable" : "", key === selectedKey ? "wl-selected" : ""].join(" ").trim();
            return (
              <tr key={key} className={cls || undefined} onClick={onRowClick && (() => onRowClick(row))}>
                {columns.map((c) => (
                  <td key={c.key} className={[c.num ? "wl-num" : "", c.className ?? ""].join(" ").trim() || undefined}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
