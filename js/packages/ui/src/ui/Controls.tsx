import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { PAGE_SIZES } from "@wizeworks/lens-core/internal";
import { fmtCount } from "../format";
import { Dropdown } from "./Dropdown";

export function Select<T extends string>({ value, options, onChange, label, small = false, autoFocus }: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
  small?: boolean;
  autoFocus?: boolean;
}) {
  return <Dropdown value={value} options={options} onChange={onChange} label={label} small={small} autoFocus={autoFocus} />;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="wl-input">
      <Search aria-hidden="true" />
      <input type="search" value={value} placeholder={placeholder} aria-label={placeholder.replace(/…$/, "")} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Page numbers around the current page, with gaps as null: 1 2 3 … 40. */
function pageList(page: number, pages: number): (number | null)[] {
  const want = new Set([1, 2, 3, page - 1, page, page + 1, pages].filter((p) => p >= 1 && p <= pages));
  const sorted = [...want].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}

export interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

/** The size choices, with the size in use when it is not one of them. */
const sizeOptions = (size: number): [string, string][] => [...new Set([...PAGE_SIZES, size])].sort((a, b) => a - b).map((s) => [String(s), `${s} / page`]);

/** Page buttons and the size menu. Hidden when every row fits on one page of the smallest size. */
export function Pager({ page, pageSize, total, noun, onPage, onPageSize }: PagerProps) {
  if (total <= Math.min(PAGE_SIZES[0]!, pageSize)) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="wl-pager">
      <span>
        {fmtCount(from)}–{fmtCount(to)} of {fmtCount(total)} {noun}
      </span>
      <div className="wl-pages">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={16} />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === null ? <span key={`gap-${i}`}>…</span> : (
            <button key={p} type="button" className={p === page ? "wl-active" : undefined} onClick={() => onPage(p)}>
              {fmtCount(p)}
            </button>
          ),
        )}
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight size={16} />
        </button>
        <Select small label="Rows per page" value={String(pageSize)} options={sizeOptions(pageSize)} onChange={(v) => onPageSize(Number(v))} />
      </div>
    </div>
  );
}
