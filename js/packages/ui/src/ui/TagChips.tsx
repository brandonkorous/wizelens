import type { TagRule } from "@wizeworks/lens-core";
import { hrefTo } from "../routes";
import type { Column } from "./Table";
import "../styles/tags.css";

/** One tag as a colored chip; it opens the Search page on `tag:name`, without also opening the row it sits on. */
export function TagChip({ tag }: { tag: Pick<TagRule, "name" | "color" | "query" | "builtIn"> }) {
  const title = `${tag.builtIn ? "Built-in tag" : "Tag"}: ${tag.query}`;
  return (
    <a className={`wl-tag wl-tag-${tag.color}`} href={hrefTo("search", [], { q: `tag:${tag.name}` })} title={title} onClick={(e) => e.stopPropagation()}>
      {tag.name}
    </a>
  );
}

/** A row's tags, or nothing. */
export function TagChips({ tags }: { tags: readonly TagRule[] }) {
  if (!tags.length) return null;
  return (
    <span className="wl-tags">
      {tags.map((t) => (
        <TagChip key={t.name} tag={t} />
      ))}
    </span>
  );
}

/** The same columns, with the row's tags after the content of column `key`. */
export function withTags<T>(columns: Column<T>[], key: string, tagsOf: (row: T) => readonly TagRule[]): Column<T>[] {
  return columns.map((c) =>
    c.key !== key
      ? c
      : {
          ...c,
          cell: (row: T) => (
            <span className="wl-tagged">
              {c.cell(row)}
              <TagChips tags={tagsOf(row)} />
            </span>
          ),
        },
  );
}
