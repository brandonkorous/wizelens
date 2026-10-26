import { useState } from "react";
import { PAGE_SIZES } from "@wizeworks/lens-core";
import { setQuery, useRoute } from "../routes";

/** A table paged in the browser: what one row is, and where its page lives. */
export interface TablePaging {
  /** For the pager's count, for example "keys". */
  noun: string;
  /** URL key ("hosts" keeps hosts.page and hosts.size); with none the page is held in the table, for dialogs. */
  key?: string;
  /** Rows per page at first; 15 when left out. */
  size?: number;
}

export interface PageHandlers {
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

export interface PagingState extends PageHandlers {
  page: number;
  size: number;
}

const whole = (v: string | null, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Pager handlers that keep the page in the URL; `key` names one of several lists on a page. */
export function urlPaging(key = ""): PageHandlers {
  return {
    onPage: (p) => setQuery({ [`${key}page`]: p > 1 ? p : null }),
    onPageSize: (s) => setQuery({ [`${key}size`]: s, [`${key}page`]: null }),
  };
}

/** The page and size of a table paged in the browser, from the URL or held here. */
export function useTablePaging(paging: TablePaging | undefined): PagingState {
  const { query } = useRoute();
  const first = paging?.size ?? PAGE_SIZES[0]!;
  const [held, setHeld] = useState({ page: 1, size: first });
  const key = paging?.key;
  if (!key) return { ...held, onPage: (page) => setHeld((h) => ({ ...h, page })), onPageSize: (size) => setHeld({ page: 1, size }) };
  return { page: whole(query.get(`${key}.page`), 1), size: whole(query.get(`${key}.size`), first), ...urlPaging(`${key}.`) };
}
