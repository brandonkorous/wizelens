import { UserRound } from "lucide-react";
import type { UserRow } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { fmtAgo, fmtCount, fmtMs, fmtPct } from "../../format";
import { decodeParam, navigate, setQuery, userHref, useRoute } from "../../routes";
import { Pager } from "../../ui/Controls";
import { UserSearch } from "./UserSearch";
import { ModelState } from "../../ui/ModelState";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { UserPage } from "./UserPage";

export const USER_COLUMNS: Column<UserRow>[] = [
  { key: "user", header: "User", cell: (u) => <span className="wl-cell-icon"><UserRound aria-hidden="true" />{u.user}</span> },
  { key: "requests", header: "Requests", num: true, cell: (u) => fmtCount(u.requests) },
  { key: "errors", header: "Failed", num: true, cell: (u) => (u.errors ? <span className="wl-text-error">{fmtCount(u.errors)}</span> : "0") },
  { key: "rate", header: "Error Rate", num: true, cell: (u) => (u.errorRate === null ? "–" : fmtPct(u.errorRate)) },
  { key: "avg", header: "Average", num: true, cell: (u) => fmtMs(u.avgMs) },
  { key: "p95", header: "p95", num: true, cell: (u) => fmtMs(u.p95Ms) },
  { key: "last", header: "Last seen", className: "wl-nowrap", cell: (u) => fmtAgo(u.lastSeenMs) },
];

function AllUsers() {
  const { model: m, loading, error } = usePageModel("users");
  const q = useRoute().query.get("q") ?? "";
  return (
    <>
      <PageHeader title="Users" subtitle="Signed-in users (enduser.id): who uses the app most, and who runs into failures and slow requests." />
      <section className="wl-panel wl-filters">
        <UserSearch value={q} />
      </section>
      <ModelState model={m} loading={loading} error={error} what="users" />
      {m && (
        <Panel title={`Users (${fmtCount(m.total)})`} flush>
          <Table columns={USER_COLUMNS} rows={m.users} rowKey={(u) => u.user} onRowClick={(u) => navigate(userHref(u.user))} empty={<Empty title={q ? "No user matches" : "No signed-in users in this range"}>Send the user's id as <code>enduser.id</code> (the add-ons do it from the signed-in user) to see them here.</Empty>} />
          {m.total > 0 && <Pager page={m.page} pageSize={m.size} total={m.total} noun="users" onPage={(p) => setQuery({ page: p })} onPageSize={(s) => setQuery({ size: s, page: null })} />}
        </Panel>
      )}
    </>
  );
}

/** Every signed-in user, or one user's page at `#/users/<id>`. */
export function UsersPage() {
  const [id] = useRoute().params;
  return id ? <UserPage key={id} user={decodeParam(id)} /> : <AllUsers />;
}
