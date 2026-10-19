import type { GroupKind, SearchDoc, SearchKind, TagMatchItem } from "@wizeworks/lens-core";
import { useGroupTags, useRowTags } from "../data/tagMatch";
import { Table, type TableProps } from "./Table";
import { withTags } from "./TagChips";

/** A table of requests, traces, spans, or logs whose rows wear their tags after column `tagged`. */
export function TaggedTable<T>({ kind, itemOf, tagged, ...table }: TableProps<T> & { kind: SearchKind; itemOf: (row: T) => TagMatchItem; tagged: string }) {
  const tagsOf = useRowTags(kind, table.rows, itemOf);
  return <Table {...table} columns={withTags(table.columns, tagged, tagsOf)} />;
}

/** A table of group rows (endpoints, services, error groups) with the tags that describe each row. */
export function GroupTaggedTable<T>({ group, docOf, tagged, ...table }: TableProps<T> & { group: GroupKind; docOf: (row: T) => SearchDoc; tagged: string }) {
  const groupTags = useGroupTags();
  return <Table {...table} columns={withTags(table.columns, tagged, (row) => groupTags(group, docOf(row)))} />;
}
