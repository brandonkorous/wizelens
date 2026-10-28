import { useState } from "react";
import { apiSend } from "../../data/api";
import { act } from "../../data/useApi";
import { fmtAgo, fmtDate, fmtTime } from "../../format";
import { Badge } from "../../ui/Badges";
import { useAsk } from "../../ui/Dialog";
import { Empty, Panel } from "../../ui/Panel";
import { ListFilter, matchesText, useSelection } from "../../ui/Selection";
import { type Column, Table } from "../../ui/Table";
import { KeysBulk } from "./KeysBulk";
import { type Kind, NewSecret, SCOPES } from "./KeyForm";
import type { ApiKey, OrgData, RevokedInUse as RevokedInUseRow } from "../organization/orgTypes";

export { KeyForm } from "./KeyForm";

const DAY_MS = 86_400_000;
const KIND_LABEL: Record<ApiKey["kind"], string> = { ingest: "Ingest", read: "Read", browser: "Browser" };
const REVOKED: Record<ApiKey["kind"], string> = {
  ingest: "Apps that send with this key stop being recorded at once.",
  read: "Agents and scripts that read with this key lose access at once.",
  browser: "Pages that send with this key stop being recorded at once.",
};

/** The revoke question: a key used in the last day is still live, and Rotate replaces it with no gap. */
function revokeText(k: ApiKey, now: number): string {
  const live = k.lastUsedMs !== null && now - k.lastUsedMs < DAY_MS;
  return live ? `It was used ${fmtAgo(k.lastUsedMs!)}, so something still uses it. ${REVOKED[k.kind]} To replace it with no gap, use Rotate instead.` : REVOKED[k.kind];
}

function scopesText(k: ApiKey): string {
  const labels = new Map(SCOPES[k.kind]);
  const may = k.scopes ? k.scopes.map((s) => labels.get(s)?.split(" (")[0] ?? s).join(", ") : "All";
  return k.origins ? `${may}, from ${k.origins.join(", ")}` : may;
}

/** "Never", the date, "Expires in 3 days" when close, or an Expired badge. */
function Expiry({ k, now }: { k: ApiKey; now: number }) {
  if (k.expiresMs === null) return <span className="wl-muted">Never</span>;
  if (k.expiresMs <= now) return <Badge tone="danger">Expired</Badge>;
  const days = Math.ceil((k.expiresMs - now) / DAY_MS);
  return days <= 14 ? <Badge tone="warning">{days <= 1 ? "In a day" : `In ${days} days`}</Badge> : <span title={fmtDate(k.expiresMs)}>{fmtDate(k.expiresMs)}</span>;
}

/** "ends Dec 31, 2026", "never ends", or "expired", for the phone line. */
function endsText(k: ApiKey, now: number): string {
  if (k.expiresMs === null) return "never ends";
  return k.expiresMs <= now ? "expired" : `ends ${fmtDate(k.expiresMs)}`;
}

/** The key's name and prefix; during a rotate, which secret is new and which is old; on a phone, the other columns in one line. */
function KeyName({ k, all, now, phone }: { k: ApiKey; all: ApiKey[]; now: number; phone: string }) {
  const replaced = all.some((o) => o.rotatedFrom === k.id) && k.expiresMs !== null && k.expiresMs > now;
  const fresh = !!k.rotatedFrom && all.some((o) => o.id === k.rotatedFrom && o.expiresMs !== null && o.expiresMs > now);
  return (
    <span className="wl-who">
      <strong>{k.name}</strong>
      <small className="wl-mono">{k.prefix}…</small>
      {fresh && <Badge tone="info">New secret</Badge>}
      {replaced && <Badge tone="warning">Old secret, stops {fmtTime(k.expiresMs!, now)}</Badge>}
      {leaked(k, now) && <Badge tone="danger">Seen in a page</Badge>}
      <small className="wl-phone-line">{phone}</small>
    </span>
  );
}

/** A secret a public page sent with that still works: once rotated or expired, there is nothing left to do. */
const leaked = (k: ApiKey, now: number) => !!k.exposed && (k.expiresMs === null || k.expiresMs > now);

/** Secret keys a public page sent with: the cloud refused the data; the key must be rotated. */
function ExposedKeys({ keys, now }: { keys: ApiKey[]; now: number }) {
  const seen = keys.filter((k) => leaked(k, now));
  if (!seen.length) return null;
  return (
    <div className="wl-banner wl-banner-error wl-panel-banner" role="alert">
      {seen.map((k) => (
        <p key={k.id}>
          <strong>{k.name}</strong> is a secret key, and a public page{k.exposed!.origin ? ` on ${k.exposed!.origin}` : ""} sent with it {fmtAgo(k.exposed!.timeMs)}. WizeLens refused that data. Rotate the key, and put a browser key in pages.
        </p>
      ))}
    </div>
  );
}

/** A site sent with a live browser key after its last try with the revoked one: the new tag is in. */
const replaced = (r: RevokedInUseRow, keys: ApiKey[]) => keys.some((k) => k.kind === "browser" && (k.lastUsedMs ?? 0) > r.timeMs && (!r.origin || (k.origins ?? []).includes(r.origin)));

/** Revoked browser keys a site still sends with: its visits are refused until the site has a new key's tag. */
function RevokedInUse({ list, keys }: { list: RevokedInUseRow[]; keys: ApiKey[] }) {
  const open = list.filter((r) => !replaced(r, keys));
  if (!open.length) return null;
  return (
    <div className="wl-banner wl-banner-warning wl-panel-banner" role="status">
      {open.map((r) => (
        <p key={r.keyId}>
          <strong>{r.name}</strong> was revoked, but a page{r.origin ? ` on ${r.origin}` : ""} still sent with it {fmtAgo(r.timeMs)}. WizeLens refuses that data, so those visits are not recorded. Make a browser key for that site and put its script tag in its pages.
        </p>
      ))}
    </div>
  );
}

function EmptyKeys({ reading }: { reading: boolean }) {
  return reading ? <Empty title="No read keys yet">Make one for each AI agent or script that reads data.</Empty> : <Empty title="No sending keys yet">Make an ingest key for each app that sends data.</Empty>;
}

/** The secret a rotation made, with when the old one stops. */
interface Rotated {
  kind: ApiKey["kind"];
  token: string;
  oldExpiresMs: number;
}

/** The keys of `kinds`: ingest (apps send), browser (pages send), or read (agents read). Expiry, scopes, sites, rotate, and revoke. */
export function KeysPanel({ orgId, data, kinds, reload }: { orgId: string; data: OrgData; kinds: readonly Kind[]; reload: () => void }) {
  const names = new Map(data.projects.map((p) => [p.id, p.name]));
  const { dialog, confirm, prompt } = useAsk();
  const [rotated, setRotated] = useState<Rotated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const now = Date.now();
  const all = data.keys.filter((k) => kinds.includes(k.kind));
  const rows = all.filter((k) => matchesText(filter, k.name, k.prefix, k.kind, ...k.projectIds.map((id) => names.get(id))));
  const { picked, select, clear } = useSelection(all.map((k) => k.id), "key");
  const revoke = async (k: ApiKey) =>
    (await confirm({ title: `Revoke ${k.name}?`, body: revokeText(k, Date.now()), confirmLabel: "Revoke key", danger: true })) &&
    void act(() => apiSend("DELETE", `./api/orgs/${orgId}/keys/${k.id}`), reload).then(setError);
  // A secret seen in a public page stops at once: anyone could have copied it.
  const rotate = async (k: ApiKey) =>
    (await confirm({ title: `Rotate ${k.name}?`, body: k.exposed ? "You get a new secret for the same key, with the same end date. The old secret was in a public page, so it stops at once." : "You get a new secret for the same key, with the same end date. The old secret keeps working for 24 hours, so you can update the apps that use it.", confirmLabel: "Rotate key" })) &&
    void act(async () => setRotated({ kind: k.kind, ...(await apiSend<{ token: string; oldExpiresMs: number }>("POST", `./api/orgs/${orgId}/keys/${k.id}/rotate`, { graceHours: k.exposed ? 0 : 24 })) }), reload).then(setError);
  const editSites = async (k: ApiKey) => {
    const origins = await prompt({ title: `Sites for ${k.name}`, body: "Only pages on these sites may send with this key. The key itself stays the same.", confirmLabel: "Save sites", input: { label: "Sites", initial: (k.origins ?? []).join(" ") } });
    if (origins !== null) void act(() => apiSend("PATCH", `./api/orgs/${orgId}/keys/${k.id}`, { origins }), reload).then(setError);
  };
  const projectsOf = (k: ApiKey) => k.projectIds.map((id) => names.get(id) ?? "Deleted project").join(", ");
  const phoneLine = (k: ApiKey) => [kinds.length > 1 ? KIND_LABEL[k.kind] : "", projectsOf(k), `used ${k.lastUsedMs ? fmtAgo(k.lastUsedMs) : "never"}`, endsText(k, now)].filter(Boolean).join(" · ");
  const columns: Column<ApiKey>[] = [
    { key: "name", header: "Key", cell: (k) => <KeyName k={k} all={all} now={now} phone={phoneLine(k)} /> },
    ...(kinds.length > 1 ? [{ key: "kind", header: "Kind", cell: (k: ApiKey) => <Badge tone="info">{KIND_LABEL[k.kind]}</Badge>, hideSm: true }] : []),
    { key: "projects", header: "Projects", cell: projectsOf, className: "wl-wrap", hideSm: true },
    { key: "scopes", header: "May", cell: (k) => scopesText(k), className: "wl-wrap", hideSm: true },
    { key: "made", header: "Created", cell: (k) => fmtDate(k.createdMs), className: "wl-nowrap", hideSm: true },
    { key: "used", header: "Last used", cell: (k) => (k.lastUsedMs ? fmtAgo(k.lastUsedMs) : "Never"), className: "wl-nowrap", hideSm: true },
    { key: "ends", header: "Expires", cell: (k) => <Expiry k={k} now={now} />, className: "wl-nowrap", hideSm: true },
    {
      key: "x",
      header: "",
      className: "wl-cell-actions",
      cell: (k) => (
        <span className="wl-row-actions">
          {k.kind === "browser" && <button type="button" className="wl-link-btn" onClick={() => void editSites(k)}>Sites</button>}
          <button type="button" className="wl-link-btn" onClick={() => void rotate(k)}>Rotate</button>
          <button type="button" className="wl-link-btn wl-text-error" onClick={() => void revoke(k)}>Revoke</button>
        </span>
      ),
    },
  ];
  return (
    <Panel flush>
      {all.length > 0 && (
        <div className="wl-list-tools">
          <ListFilter value={filter} onChange={setFilter} placeholder="Filter by key, project, or kind" />
          {filter && <span className="wl-muted wl-small">{rows.length} of {all.length}</span>}
        </div>
      )}
      <KeysBulk orgId={orgId} picked={all.filter((k) => picked.includes(k.id))} names={names} clear={clear} reload={reload} onDone={(err, ok) => (setError(err), setNote(ok))} />
      <ExposedKeys keys={all} now={now} />
      {kinds.includes("browser") && <RevokedInUse list={data.revokedInUse ?? []} keys={all} />}
      {error && <div className="wl-banner wl-banner-error wl-panel-banner">{error}</div>}
      {note && <p className="wl-panel-note" role="status">{note}</p>}
      {rotated && (
        <div className="wl-panel-banner">
          <NewSecret kind={rotated.kind} secret={rotated.token} note={`The old secret stops ${fmtDate(rotated.oldExpiresMs)}.`} />
        </div>
      )}
      <Table paging={{ noun: "keys", key: kinds.includes("read") ? "readkeys" : "keys", reset: filter }} columns={columns} rows={rows} rowKey={(k) => k.id} select={select} empty={filter ? <Empty>No key matches “{filter}”.</Empty> : <EmptyKeys reading={kinds.includes("read")} />} />
      {dialog}
    </Panel>
  );
}
