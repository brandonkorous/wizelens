import { Upload } from "lucide-react";
import { SEARCH_KINDS, type SearchKind, type SearchSummary } from "@wizeworks/lens-core";
import { downloadCsv, objectsToCsv } from "../../data/csv";
import { useSavedItems } from "../../data/saved";
import { useSearchSummary } from "../../data/searchSummary";
import { TimeChart } from "../../ui/TimeChart";
import { useHost, useRange } from "../../data/host";
import { type SearchFailure, type SearchState, useSearch } from "../../data/search";
import { setQuery, useRoute } from "../../routes";
import { Empty, PageHeader, Panel, TabBar } from "../../ui/Panel";
import { QueryBar } from "../../ui/QueryBar";
import { Table } from "../../ui/Table";
import { resultKey, SEARCH_COLUMNS } from "./columns";
import "../../styles/pages/search.css";

const PAGE = 50;
const TABS: [SearchKind, string][] = [["requests", "Requests"], ["traces", "Traces"], ["spans", "Spans"], ["logs", "Logs"]];
const countText = (c: { n: number; more: boolean } | undefined) => (c ? `${c.n.toLocaleString()}${c.more ? "+" : ""}` : "");
const isKind = (v: string | null): v is SearchKind => (SEARCH_KINDS as readonly string[]).includes(v ?? "");

/** The host did not answer. A bad search is shown under the box instead. */
function Failure({ failure }: { failure: SearchFailure }) {
  if (failure.type === "invalid") return <Empty title="Fix the search above to see results" />;
  return <Empty title="Search is not answering">{failure.message}. Your search is fine. Try again in a moment.</Empty>;
}

/** Downloads the results shown so far as CSV ("Show more" first for more). */
function ExportShown({ kind, rows }: { kind: SearchKind; rows: readonly object[] }) {
  return (
    <button type="button" className="wl-btn wl-btn-sm" title="Download the results shown as CSV" onClick={() => downloadCsv(`search-${kind}`, objectsToCsv(rows))}>
      <Upload aria-hidden="true" /> Export
    </button>
  );
}

function Results({ kind, s }: { kind: SearchKind; s: SearchState }) {
  const rows = s.pages.flatMap((p) => p.items);
  const settling = s.pages[0]?.settling;
  const empty = s.loading ? <Empty title="Searching…" /> : <Empty title="Nothing matches">Try fewer terms, another kind, or a wider time range.</Empty>;
  return (
    <Panel title={`${TABS.find(([k]) => k === kind)![1]} (${rows.length}${s.more ? "+" : ""})`} flush action={rows.length > 0 && <ExportShown kind={kind} rows={rows} />}>
      {settling ? <p className="wl-search-note wl-muted wl-small">Search is catching up: {settling} {settling === 1 ? "trace is" : "traces are"} not in the results yet.</p> : null}
      {s.failure ? <Failure failure={s.failure} /> : <Table columns={SEARCH_COLUMNS[kind] as never} rows={rows as never[]} rowKey={(r) => resultKey(kind, r)} empty={empty} />}
      {s.more && (
        <div className="wl-search-more">
          <button type="button" className="wl-btn" onClick={s.more}>
            Show more
          </button>
        </div>
      )}
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
  return (
    <div className="wl-search-page">
      <PageHeader title="Search" subtitle="Find any request, trace, span, or log line. Type a field such as service: or @ for an attribute." />
      <section className="wl-panel wl-search-bar">
        <QueryBar value={q} onSubmit={(next) => setQuery({ q: next || null })} range={range} server={server} serverError={invalid} />
        <TabBar tabs={tabs} value={kind} onChange={(k) => setQuery({ kind: k === "requests" ? null : k })} />
        <SavedSearches />
      </section>
      {summary && <ResultsOverTime summary={summary} kind={kind} />}
      <Results kind={kind} s={s} />
    </div>
  );
}
