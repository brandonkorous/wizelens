import { type PointerEvent, useEffect, useState } from "react";
import { STATUS_DAYS, type StatusCheckView, type StatusPageView } from "@wizeworks/lens-core/internal";
import { apiFetch } from "../../data/api";
import { fmtDateTime } from "../../format";
import { Logo } from "../../shell/Logo";
import { DotText } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { fmtLength, fmtUptime, stateOf, toneOfUptime } from "../uptime/uptimeParts";
import "../../styles/pages/uptime.css";

const REFRESH_MS = 60_000;
const DAY_MS = 86_400_000;
/** Each bar is a UTC day, so its date is the UTC date, whatever the viewer's zone. */
const utcDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** One bar a day. A touch or a pointer on a bar names its day under the bars, since a phone has no hover title. */
function DayBars({ days, nowMs }: { days: (number | null)[]; nowMs: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const first = Math.floor(nowMs / DAY_MS) * DAY_MS - (STATUS_DAYS - 1) * DAY_MS;
  const textOf = (i: number) => `${utcDay(first + i * DAY_MS)} (UTC): ${days[i] === null ? "no data" : fmtUptime(days[i]!)}`;
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPicked(Math.min(days.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * days.length))));
  };
  return (
    <>
      <div className="wl-status-bars" role="img" aria-label={`Uptime per day for the last ${STATUS_DAYS} days`} onPointerDown={pick} onPointerMove={(e) => e.buttons > 0 && pick(e)}>
        {days.map((d, i) => (
          <span key={i} className={`wl-status-bar wl-tone-${toneOfUptime(d)}${picked === i ? " wl-picked" : ""}`} title={textOf(i)} />
        ))}
      </div>
      {picked !== null ? <p className="wl-status-day" aria-live="polite">{textOf(picked)}</p> : <p className="wl-status-hint wl-muted wl-small">Tap a bar to see its day.</p>}
    </>
  );
}

function CheckRow({ c, nowMs }: { c: StatusCheckView; nowMs: number }) {
  const s = stateOf({ enabled: true, state: c.state });
  return (
    <li className="wl-status-check">
      <div className="wl-status-check-head">
        <strong>{c.name}</strong>
        <DotText tone={s.tone} colorText>{s.label === "Up" ? "Operational" : s.label === "Down" ? "Down" : "Checking"}</DotText>
      </div>
      <DayBars days={c.days} nowMs={nowMs} />
      <div className="wl-status-check-foot wl-muted wl-small">
        <span>{STATUS_DAYS} days ago</span>
        <span>24 h {fmtUptime(c.uptime["24h"])} · 7 days {fmtUptime(c.uptime["7d"])} · 30 days {fmtUptime(c.uptime["30d"])}</span>
        <span>Today</span>
      </div>
    </li>
  );
}

function Summary({ view }: { view: StatusPageView }) {
  const down = view.checks.filter((c) => c.state === "down");
  const cls = down.length ? "wl-status-summary wl-status-down" : "wl-status-summary";
  return <div className={cls}>{down.length === 0 ? "All systems operational" : `${down.length} of ${view.checks.length} ${view.checks.length === 1 ? "system is" : "systems are"} down`}</div>;
}

function Body({ view }: { view: StatusPageView }) {
  return (
    <>
      <Summary view={view} />
      <Panel>
        {view.checks.length === 0 ? <Empty>Nothing is checked yet.</Empty> : <ul className="wl-status-checks">{view.checks.map((c) => <CheckRow key={c.name} c={c} nowMs={view.nowMs} />)}</ul>}
      </Panel>
      <Panel title="Past Incidents">
        {view.incidents.length === 0 ? <Empty>No incidents in the last {STATUS_DAYS} days.</Empty> : (
          <ul className="wl-status-incidents">
            {view.incidents.map((i) => (
              <li key={`${i.checkName}-${i.startMs}`}>
                <strong>{i.checkName}</strong> {i.endMs === null ? "is down" : "was down"} <span className="wl-muted">{i.endMs === null ? `since ${fmtDateTime(i.startMs)}` : `for ${fmtLength(i.endMs - i.startMs)}, from ${fmtDateTime(i.startMs)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

/** A project's public status page. No sign-in, no navigation: check states, uptime, and incidents, refreshed every minute. */
export function StatusPage({ token }: { token: string }) {
  const [view, setView] = useState<StatusPageView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = () => apiFetch<StatusPageView>(`./api/status/${encodeURIComponent(token)}`).then((v) => (setView(v), setError(null)), (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [token]);
  useEffect(() => void (document.title = view ? view.title : "Status"), [view]);
  return (
    <div className="wl-shared wl-status">
      <header className="wl-shared-head">
        <h1 className="wl-status-title">{view?.title ?? "Status"}</h1>
        <span className="wl-status-by">
          <span className="wl-muted wl-small">Uptime by</span>
          <span className="wl-brand-row"><Logo /></span>
        </span>
      </header>
      <main className="wl-page wl-status-main">
        {view ? <Body view={view} /> : <Panel><Empty title={error ? "This status page does not exist" : "Loading…"}>{error}</Empty></Panel>}
      </main>
    </div>
  );
}
