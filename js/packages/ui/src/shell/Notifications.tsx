import { useMemo } from "react";
import { Bell, Lightbulb, TriangleAlert } from "lucide-react";
import { errorInfo, isErrorSpan, requestRows, type Trace } from "@wizeworks/lens-core";
import { useSeenPref } from "../data/prefs";
import { fmtAgo } from "../format";
import { traceHref } from "../routes";
import { Menu } from "./Menu";

interface Note {
  key: string;
  kind: "error" | "insight";
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

function NoteItem({ note, unread, now }: { note: Note; unread: boolean; now: number }) {
  const Icon = note.kind === "error" ? TriangleAlert : Lightbulb;
  return (
    <a className="wl-menu-item wl-note" href={note.href}>
      <Icon size={18} color={note.kind === "error" ? "var(--wl-red)" : "var(--wl-amber)"} aria-hidden="true" />
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
  const notes = useMemo(() => notesOf(traces, now), [traces, now]);
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

