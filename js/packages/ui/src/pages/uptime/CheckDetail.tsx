import { type ReactNode, useState } from "react";
import { ArrowLeft, Clock, HeartPulse } from "lucide-react";
import type { UptimeCheckInput, UptimeCheckView, UptimeModel } from "@wizeworks/lens-core";
import { fmtAgo, fmtCount, fmtDate, fmtMs } from "../../format";
import { usePageModel } from "../../data/models";
import { useUptime } from "../../data/uptime";
import { hrefTo, navigate } from "../../routes";
import { Empty, Panel } from "../../ui/Panel";
import { breakable } from "../../ui/breakable";
import { StatCard } from "../../ui/StatCard";
import { TimeChart } from "../../ui/TimeChart";
import { useAsk } from "../../ui/Dialog";
import { CheckForm } from "./CheckForm";
import { deleteCheck } from "./uptimeParts";
import { IncidentsPanel } from "./IncidentsPanel";
import { CertBadge, StateText } from "./UptimeTable";
import { fmtUptime, statsOf, toneOfUptime } from "./uptimeParts";
import "../../styles/pages/services.css";

const FAIL_BARS = "color-mix(in srgb, var(--wl-red) 45%, transparent)";

function statsRows(c: UptimeCheckView, nowMs: number): [string, ReactNode][] {
  return [
    ["URL", <code key="u">{c.method} {breakable(c.url)}</code>],
    ["Runs", c.intervalMin === 1 ? "Every minute" : `Every ${c.intervalMin} minutes`],
    ["Expects", `${c.expectStatus}${c.expectBody ? ` and "${c.expectBody}"` : ""}`],
    ["Last check", c.lastRunMs ? `${fmtAgo(c.lastRunMs, nowMs)} · ${c.lastStatus ?? "no answer"} · ${fmtMs(c.lastDurationMs)}` : "Not yet"],
    ["Certificate", c.tlsExpiresMs ? <span key="t"><CertBadge c={c} nowMs={nowMs} /> ends {fmtDate(c.tlsExpiresMs)}</span> : <CertBadge key="t" c={c} nowMs={nowMs} />],
    ...(c.env ? [["Environment", c.env] as [string, string]] : []),
  ];
}

function Header({ c, nowMs, actions }: { c: UptimeCheckView; nowMs: number; actions: ReactNode }) {
  return (
    <section className="wl-panel wl-svc-head">
      <a className="wl-back" href={hrefTo("uptime")}>
        <ArrowLeft size={14} aria-hidden="true" /> All checks
      </a>
      <h1 className="wl-svc-title">
        <HeartPulse size={22} aria-hidden={true} />
        <span className="wl-svc-name">{c.name}</span>
        <span className="wl-svc-status"><StateText c={c} /></span>
        {actions}
      </h1>
      {c.state === "down" && c.lastError && <div className="wl-banner wl-banner-error wl-uptime-error">{c.lastError}</div>}
      <dl className="wl-stats">
        {statsRows(c, nowMs).map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}

const WINDOW_MS = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 } as const;

/** How long a young check has run, for a window it has not filled yet ("6 h", "3 days"). */
const ranFor = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)} h` : `${Math.round(ms / 86_400_000)} days`);

function windowNote(c: UptimeCheckView, w: keyof typeof WINDOW_MS, nowMs: number): string {
  if (c.uptime[w] === null) return "No runs yet";
  const tone = toneOfUptime(c.uptime[w]) === "success" ? "On target" : "Below 99.9%";
  const age = nowMs - c.createdMs;
  // A check younger than the window has not filled it, so the card says how much it covers.
  return age < WINDOW_MS[w] ? `${tone} · ${ranFor(age)} measured so far` : tone;
}

function Charts({ c, model, nowMs }: { c: UptimeCheckView; model: UptimeModel | null; nowMs: number }) {
  const s = statsOf(model, c.id);
  const card = (w: keyof typeof WINDOW_MS, label: string) => <StatCard icon={HeartPulse} label={label} value={fmtUptime(c.uptime[w])} change={null} upIsGood compareLabel="" note={windowNote(c, w, nowMs)} danger={toneOfUptime(c.uptime[w]) === "danger"} />;
  return (
    <>
      <div className="wl-grid wl-grid-stats">
        {card("24h", "Uptime (24 h)")}
        {card("7d", "Uptime (7 days)")}
        {card("30d", "Uptime (30 days)")}
        <StatCard icon={Clock} label="Avg Response" value={fmtMs(s?.avgMs)} change={null} upIsGood={false} compareLabel="" note={`${fmtCount(s?.runs ?? 0)} ${s?.runs === 1 ? "run" : "runs"}, ${fmtCount(s?.failures ?? 0)} failed`} series={s?.avgMsSeries} />
      </div>
      <Panel title="Response Time">
        {model && s ? (
          <TimeChart starts={model.starts} lines={[{ label: "Average", values: s.avgMsSeries, color: "var(--wl-blue)" }]} bars={[{ label: "Failed", values: s.failSeries, color: FAIL_BARS }]} separateBarScale height={240} format={(v) => fmtMs(v)} />
        ) : (
          <Empty title="No runs in this time range">Pick a longer range at the top, or run the check now.</Empty>
        )}
      </Panel>
    </>
  );
}

/** One check on its own page: state, uptime, response time over the range, and its incidents. */
export function CheckDetail({ id }: { id: string }) {
  const api = useUptime();
  const { model } = usePageModel("uptime", { check: id });
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { dialog, confirm } = useAsk();
  const c = api.data?.checks.find((x) => x.id === id);
  if (!api.data) return <Panel><Empty title={api.error ? "Could not load the check" : "Loading…"}>{api.error}</Empty></Panel>;
  if (!c) return <Panel><a className="wl-back" href={hrefTo("uptime")}><ArrowLeft size={14} aria-hidden="true" /> All checks</a><Empty title="This check does not exist">It may have been deleted.</Empty></Panel>;
  const save = async (d: UptimeCheckInput) => {
    const err = await api.save(d, c.id);
    if (!err) setEditing(false);
    return err;
  };
  const actions = api.canWrite && (
    <span className="wl-uptime-actions">
      <button type="button" className="wl-btn" onClick={() => void api.runNow(c.id).then((e) => setNote(e ?? "Ran the check."))}>Run now</button>
      <button type="button" className="wl-btn" onClick={() => setEditing(true)}>Edit</button>
      <button type="button" className="wl-btn wl-text-error" onClick={async () => (await confirm(deleteCheck(c.name))) && void api.remove(c.id).then((e) => (e ? setNote(e) : navigate(hrefTo("uptime"))))}>Delete</button>
      {dialog}
    </span>
  );
  return (
    <div className="wl-svc-page">
      <Header c={c} nowMs={api.data.nowMs} actions={actions} />
      {note && <div className="wl-banner wl-banner-info">{note}</div>}
      {editing && <CheckForm initial={c} onSave={save} onCancel={() => setEditing(false)} />}
      <Charts c={c} model={model} nowMs={api.data.nowMs} />
      <IncidentsPanel incidents={api.data.incidents.filter((i) => i.checkId === id)} nowMs={api.data.nowMs} withCheck={false} />
    </div>
  );
}
