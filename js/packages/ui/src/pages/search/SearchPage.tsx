import { Upload } from "lucide-react";
import { checkSearch, type SearchItems, SEARCH_KINDS, type SearchKind, type SearchSummary, searchScope, usesTags } from "@wizeworks/lens-core";
import { downloadCsv, objectsToCsv } from "../../data/csv";
import { useSavedItems } from "../../data/saved";
import { useSearchSummary } from "../../data/searchSummary";
import { TimeChart } from "../../ui/TimeChart";
import { useHost, useRange } from "../../data/host";
import { type SearchFailure, type SearchState, useSearch } from "../../data/search";
import { setQuery, useRoute } from "../../routes";
import { Empty, PageHeader, Panel, TabBar } from "../../ui/Panel";
import { QueryBar } from "../../ui/QueryBar";
import { type Column, Table } from "../../ui/Table";
import { withTags } from "../../ui/TagChips";
import { TagThis } from "../../ui/TagThis";
import { useRowTags } from "../../data/tagMatch";
import { resultItem, resultKey, SEARCH_COLUMNS, TAGGED_COLUMN } from "./columns";
import { SearchPager, useSearchPage } from "./SearchPager";
import "../../styles/pages/search.css";

const PAGE = 50;
const TABS: [SearchKind, string][] = [["requests", "Requests"], ["traces", "Traces"], ["spans", "Spans"], ["logs", "Logs"]];
const countText = (c: { n: number; more: boolean } | undefined) => (c ? `${c.n.toLocaleString()}${c.more ? "+" : ""}` : "");

type Row = SearchItems[SearchKind];

const isKind = (v: string | null): v is SearchKind => (SEARCH_KINDS as readonly string[]).includes(v ?? "");

/** The host did not answer. A bad search is shown under the box instead. */
function Failure({ failure }: { failure: SearchFailure }) {
  if (failure.type === "invalid") return <Empty title="Fix the search above to see results" />;
  return <Empty title="Search is not answering">{failure.message}. Your search is fine. Try again in a moment.</Empty>;
}

/** Downloads every result loaded so far as CSV (step to later pages first for more). */
function ExportShown({ kind, rows }: { kind: SearchKind; rows: readonly object[] }) {
  return (
    <button type="button" className="wl-btn wl-btn-sm" title="Download the results shown as CSV" onClick={() => downloadCsv(`search-${kind}`, objectsToCsv(rows))}>
      <Upload aria-hidden="true" /> Export loaded
    </button>
  );
}

interface ResultsProps {
  kind: SearchKind;
  s: SearchState;
  /** The search's own key, so a new search goes back to page 1. */
  searchKey: string;
  counted: { n: number; more: boolean } | undefined;
}

function Results({ kind, s, searchKey, counted }: ResultsProps) {
  const all = s.pages.flatMap((p) => p.items) as Row[];
  const { at, go } = useSearchPage(searchKey, s);
  const rows = (s.pages[at]?.items ?? []) as Row[];
  const total = counted && counted.n >= all.length ? counted : { n: all.length, more: !!s.more };
  const settling = s.pages[0]?.settling;
  const unknown = s.pages[0]?.unknownTags ?? [];
  const tagsOf = useRowTags(kind, rows, (r) => resultItem(kind, r));
  const columns = withTags(SEARCH_COLUMNS[kind] as Column<Row>[], TAGGED_COLUMN[kind], tagsOf);
  const empty = s.loading ? <Empty title="Searching…" /> : <Empty title="Nothing matches">Try fewer terms, another kind, or a wider time range.</Empty>;
  return (
    <Panel title={`${TABS.find(([k]) => k === kind)![1]} (${countText(total)})`} flush action={all.length > 0 && <ExportShown kind={kind} rows={all} />}>
      {settling ? <p className="wl-search-note wl-muted wl-small">Search is catching up: {settling} {settling === 1 ? "trace is" : "traces are"} not in the results yet.</p> : null}
      {unknown.length > 0 && <p className="wl-search-note wl-muted wl-small">No tag named {unknown.join(", ")}. It finds only tags your app sets with that name.</p>}
      {s.failure ? <Failure failure={s.failure} /> : <Table columns={columns} rows={rows} rowKey={(r) => resultKey(kind, r)} empty={empty} />}
      {!s.failure && <SearchPager s={s} at={at} size={PAGE} total={total} noun={kind} onPage={go} />}
    </Panel>
  );
}

/** When the chosen kind's results happened (the first 1000 counted). */
function ResultsOverTime({ summary, kind }: { summary: SearchSummary; kind: SearchKind }) {
  const label = TABS.find(([k]) => k === kind)![1];
  return (
    <Panel title={`${label} Over Time`}>
      <TimeChart starts={summary.starts} bars={[{ label, values: summary.histogram, color: "var(--wl-blue)" }]} height={140} />
    </Panel>
  );
}

/** Saved searches as links under the box; the star in the top bar saves the one open. */
function SavedSearches() {
  const { items } = useSavedItems("search");
  if (items.length === 0) return null;
  return (
    <div className="wl-saved-searches">
      <span className="wl-muted wl-small">Saved:</span>
      {items.map((i) => (
        <a key={i.id} className="wl-filter-chip" href={i.href} title={i.ownerName ? `Saved by ${i.ownerName}` : undefined}>{i.name}</a>
      ))}
    </div>
  );
}

/** Search requests, traces, spans, and logs with the search language. The search and kind live in the URL. */
export function SearchPage() {
  const { query } = useRoute();
  const q = query.get("q") ?? "";
  const kind = isKind(query.get("kind")) ? (query.get("kind") as SearchKind) : "requests";
  const [range] = useRange();
  const server = useHost().has("search");
  const s = useSearch({ q, kind, range, limit: PAGE }, server);
  const invalid = s.failure?.type === "invalid" ? s.failure : null;
  const summary = useSearchSummary(q, kind, range, server);
  const tabs = TABS.map(([k, label]): [SearchKind, string] => [k, summary ? `${label} (${countText(summary.counts[k])})` : label]);
  const parsed = checkSearch(q);
  const scopes = q.trim() && parsed.ok && parsed.node && !usesTags(parsed.node) ? [searchScope(q.trim())] : [];
  return (
    <div className="wl-search-page">
      <PageHeader title="Search" subtitle="Find any request, trace, span, or log line. Type a field such as service: or @ for an attribute.">
        <TagThis scopes={scopes} />
      </PageHeader>
      <section className="wl-panel wl-search-bar">
        <QueryBar value={q} onSubmit={(next) => setQuery({ q: next || null })} range={range} server={server} serverError={invalid} />
        <TabBar tabs={tabs} value={kind} onChange={(k) => setQuery({ kind: k === "requests" ? null : k })} />
        <SavedSearches />
      </section>
      {summary && <ResultsOverTime summary={summary} kind={kind} />}
      <Results kind={kind} s={s} searchKey={JSON.stringify([q, kind, range, server])} counted={summary?.counts[kind]} />
    </div>
  );
}
