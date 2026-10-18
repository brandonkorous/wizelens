import { useCallback, useEffect, useState } from "react";
import { auth } from "../../data/account";
import { fmtAgo, fmtDateTime } from "../../format";
import { Badge } from "../../ui/Badges";
import { Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { ActionNotes, useAction } from "./useAction";

interface SessionRow {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

const msOf = (d: Date | string) => new Date(d).getTime();

const BROWSERS: [RegExp, string][] = [[/Edg\//, "Edge"], [/OPR\//, "Opera"], [/Firefox\//, "Firefox"], [/Chrome\//, "Chrome"], [/Safari\//, "Safari"]];
const SYSTEMS: [RegExp, string][] = [[/iPhone|iPad/, "iOS"], [/Android/, "Android"], [/Windows/, "Windows"], [/Mac OS X|Macintosh/, "macOS"], [/CrOS/, "ChromeOS"], [/Linux/, "Linux"]];

/** "Chrome on Windows" from a user agent; the start of it when it is not a known browser. */
export function shortAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = BROWSERS.find(([r]) => r.test(ua))?.[1];
  const system = SYSTEMS.find(([r]) => r.test(ua))?.[1];
  if (browser) return system ? `${browser} on ${system}` : browser;
  return ua.length > 40 ? `${ua.slice(0, 40)}…` : ua;
}

/** Where this account is signed in. Better Auth lists them only after a recent sign-in. */
export function SessionsPanel({ sessionId }: { sessionId?: string }) {
  const a = useAction();
  const list = useAction();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const { run } = list;
  const load = useCallback(() => void run(async () => setRows((await auth((c) => c.listSessions())) as SessionRow[])), [run]);
  useEffect(load, [load]);
  const revoke = (s: SessionRow) => void a.run(() => auth((c) => c.revokeSession({ token: s.token })), "Signed out.").then(load);
  const revokeOthers = () => void a.run(() => auth((c) => c.revokeOtherSessions()), "Signed out of all other devices.").then(load);
  const columns: Column<SessionRow>[] = [
    { key: "device", header: "Device", cell: (s) => <span title={s.userAgent ?? undefined}>{shortAgent(s.userAgent)}</span> },
    { key: "ip", header: "Address", cell: (s) => <span className="wl-mono wl-small">{s.ipAddress || "–"}</span> },
    { key: "made", header: "Signed in", cell: (s) => fmtDateTime(msOf(s.createdAt)), className: "wl-nowrap" },
    { key: "seen", header: "Last active", cell: (s) => fmtAgo(msOf(s.updatedAt)), className: "wl-nowrap" },
    { key: "x", header: "", className: "wl-cell-actions", cell: (s) => (s.id === sessionId ? <Badge tone="info">This device</Badge> : <button type="button" className="wl-link-btn wl-text-error" onClick={() => revoke(s)}>Sign out</button>) },
  ];
  const others = (rows ?? []).some((s) => s.id !== sessionId);
  const action = others && <button type="button" className="wl-btn" onClick={revokeOthers} disabled={a.busy}>Sign out all other devices</button>;
  return (
    <Panel title="Signed in" action={action}>
      <ActionNotes a={list} />
      <ActionNotes a={a} />
      {rows && <Table columns={columns} rows={rows} rowKey={(s) => s.id} />}
    </Panel>
  );
}
