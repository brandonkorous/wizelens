import { useMemo } from "react";
import { Bell, BellRing, Lightbulb, TriangleAlert } from "lucide-react";
import { errorInfo, isErrorSpan, requestRows, type Trace } from "@wizeworks/lens-core";
import { useHost } from "../data/host";
import { useSeenPref } from "../data/prefs";
import { useApi } from "../data/useApi";
import { type AlertsData, useAlertsApi } from "../pages/alerts/alertTypes";
import { alertHref } from "../routes";
import { fmtAgo } from "../format";
import { traceHref } from "../routes";
import { Menu } from "./Menu";

interface Note {
  key: string;
  kind: "error" | "insight" | "alert";
  title: string;
  detail: string;
  timeMs: number;
  count: number;
  href: string;
}

const DAY_MS = 24 * 60 * 60_000;
const MAX_NOTES = 15;

function errorMessage(trace: Trace): string {
  const span = trace.spans.find(isErrorSpan);
  return span ? errorInfo(span).message : "Request failed";
}

function add(map: Map<string, Note>, note: Note): void {
  const old = map.get(note.key);
  if (!old) map.set(note.key, note);
  else map.set(note.key, { ...note, count: old.count + 1, timeMs: Math.max(old.timeMs, note.timeMs) });
}

/** Errors and insights of the last day, grouped by endpoint and kind. */
function notesOf(traces: readonly Trace[], now: number): Note[] {
  const recent = traces.filter((t) => t.startMs >= now - DAY_MS);
  const byId = new Map(recent.map((t) => [t.traceId, t]));
  const map = new Map<string, Note>();
  for (const r of requestRows(recent)) {
    const href = traceHref(r.traceId);
    if (r.errors > 0 || (r.status ?? 0) >= 500) {
      const msg = errorMessage(byId.get(r.traceId)!);
      add(map, { key: `e|${r.endpoint}|${msg}`, kind: "error", title: `Error in ${r.endpoint}`, detail: msg, timeMs: r.startMs, count: 1, href });
    }
    for (const f of r.findings.filter((x) => x.kind !== "error")) {
      add(map, { key: `i|${r.endpoint}|${f.kind}`, kind: "insight", title: f.title, detail: r.endpoint, timeMs: r.startMs, count: 1, href: traceHref(r.traceId, "insights") });
    }
  }
  return [...map.values()].sort((a, b) => b.timeMs - a.timeMs).slice(0, MAX_NOTES);
}

/** Alerts that fired in the last day, on hosts that run alert rules. */
function useAlertNotes(now: number): Note[] {
  const on = useHost().has("alerts");
  const api = useAlertsApi();
  const { data } = useApi<AlertsData>(on && api.ready ? api.url() : null);
  return useMemo(
    () =>
      (data?.events ?? [])
        .filter((e) => (e.kind === "fired" || e.kind === "remind") && e.timeMs >= now - DAY_MS)
        .map((e): Note => ({ key: `a|${e.id}`, kind: "alert", title: `${e.kind === "remind" ? "Still firing" : "Alert"}: ${e.ruleName}`, detail: e.message, timeMs: e.timeMs, count: 1, href: alertHref(e.ruleId) })),
    [data, now],
  );
}

const ICON = { error: TriangleAlert, insight: Lightbulb, alert: BellRing };

function NoteItem({ note, unread, now }: { note: Note; unread: boolean; now: number }) {
  const Icon = ICON[note.kind];
  return (
    <a className="wl-menu-item wl-note" href={note.href}>
      <Icon size={18} color={note.kind === "insight" ? "var(--wl-amber)" : "var(--wl-red)"} aria-hidden="true" />
      <span className="wl-truncate">
        <strong className={unread ? undefined : "wl-muted"}>{note.title}</strong>
        <span className="wl-muted wl-small wl-truncate" style={{ display: "block" }}>
          {note.count > 1 ? `${note.count}× · ` : ""}
          {note.detail}
        </span>
      </span>
      <span className="wl-muted wl-small">{fmtAgo(note.timeMs, now)}</span>
    </a>
  );
}

export function Notifications({ traces, now }: { traces: readonly Trace[]; now: number }) {
  const [seen, setSeen] = useSeenPref();
  const alerts = useAlertNotes(now);
  const notes = useMemo(() => [...alerts, ...notesOf(traces, now)].sort((a, b) => b.timeMs - a.timeMs).slice(0, MAX_NOTES), [alerts, traces, now]);
  const unread = notes.filter((n) => n.timeMs > Number(seen)).length;
  const label = (
    <>
      <Bell size={20} aria-hidden="true" />
      {unread > 0 && <span className="wl-ping" />}
    </>
  );
  return (
    <Menu label={label} title={unread ? `${unread} new notifications` : "Notifications"} buttonClass="wl-icon-btn" onOpen={() => setTimeout(() => setSeen(String(Date.now())), 1500)}>
      {() => (
        <div style={{ width: 380 }}>
          <div className="wl-menu-head">Last 24 hours</div>
          {notes.length === 0 && <div className="wl-menu-note">No errors or insights. All quiet.</div>}
          {notes.map((n) => (
            <NoteItem key={n.key} note={n} unread={n.timeMs > Number(seen)} now={now} />
          ))}
        </div>
      )}
    </Menu>
  );
}

