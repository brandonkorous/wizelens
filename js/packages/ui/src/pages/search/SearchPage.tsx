import { SEARCH_KINDS, type SearchKind } from "@wizeworks/lens-core";
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
const isKind = (v: string | null): v is SearchKind => (SEARCH_KINDS as readonly string[]).includes(v ?? "");

/** The host did not answer. A bad search is shown under the box instead. */
function Failure({ failure }: { failure: SearchFailure }) {
  if (failure.type === "invalid") return <Empty title="Fix the search above to see results" />;
  return <Empty title="Search is not answering">{failure.message}. Your search is fine. Try again in a moment.</Empty>;
}

function Results({ kind, s }: { kind: SearchKind; s: SearchState }) {
  const rows = s.pages.flatMap((p) => p.items);
  const settling = s.pages[0]?.settling;
  const empty = s.loading ? <Empty title="Searching…" /> : <Empty title="Nothing matches">Try fewer terms, another kind, or a wider time range.</Empty>;
  return (
    <Panel title={`${TABS.find(([k]) => k === kind)![1]} (${rows.length}${s.more ? "+" : ""})`} flush>
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

/** Search requests, traces, spans, and logs with the search language. The search and kind live in the URL. */
export function SearchPage() {
  const { query } = useRoute();
  const q = query.get("q") ?? "";
  const kind = isKind(query.get("kind")) ? (query.get("kind") as SearchKind) : "requests";
  const [range] = useRange();
  const server = useHost().has("search");
  const s = useSearch({ q, kind, range, limit: PAGE }, server);
  const invalid = s.failure?.type === "invalid" ? s.failure : null;
  return (
    <div className="wl-search-page">
      <PageHeader title="Search" subtitle="Find any request, trace, span, or log line. Type a field such as service: or @ for an attribute." />
      <section className="wl-panel wl-search-bar">
        <QueryBar value={q} onSubmit={(next) => setQuery({ q: next || null })} range={range} server={server} serverError={invalid} />
        <TabBar tabs={TABS} value={kind} onChange={(k) => setQuery({ kind: k === "requests" ? null : k })} />
      </section>
      <Results kind={kind} s={s} />
    </div>
  );
}
