import type { ReactNode } from "react";
import { slicePage } from "@wizeworks/lens-core/internal";
import { Pager } from "./Controls";
import { type TablePaging, useTablePaging } from "./paging";

/** One page of rows for a hand-built table, and the pager to show under it. */
export function usePagedRows<T>(rows: readonly T[], paging: TablePaging): { rows: T[]; pager: ReactNode } {
  const pg = useTablePaging(paging);
  const shown = slicePage(rows, pg.page, pg.size);
  return { rows: shown.rows, pager: <Pager page={shown.page} pageSize={pg.size} total={rows.length} noun={paging.noun} onPage={pg.onPage} onPageSize={pg.onPageSize} /> };
}
