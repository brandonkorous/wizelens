import { type ReactNode, useEffect, useId, useState, useSyncExternalStore } from "react";
import { createPageMonitor, EMPTY_PAGE_STATS, type PageStats } from "./page.js";
import type { RecordedRequest, Recorder } from "./recorder.js";

const STYLE_ID = "wzp-hud-style";
const OPEN_KEY = "wzp-hud-open";
const BAR_KEY = "wzp-hud-bar";

const CSS = `
.wzp-hud{--bg:#ffffff;--fg:#1b1f24;--muted:#5d6670;--line:#e3e6ea;--accent:#5b4ee6;--accent2:#0ea5b7;--ok:#1f8a4c;--warn:#b26b00;--err:#c9302c;
--glass:color-mix(in oklab,var(--bg) 78%,transparent);--seg:color-mix(in oklab,var(--fg) 5%,transparent);
position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:8px;
max-width:calc(100vw - 32px);font:12px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fg)}
@media (prefers-color-scheme:dark){.wzp-hud{--bg:#16181d;--fg:#e8eaed;--muted:#9aa3ad;--line:#2b2f36;--accent:#8b80ff;--accent2:#3dd5e6;--ok:#4cc38a;--warn:#f0b13c;--err:#ff6b66}}
.wzp-hud *{box-sizing:border-box}
.wzp-glass{background:var(--glass);-webkit-backdrop-filter:blur(18px) saturate(1.5);backdrop-filter:blur(18px) saturate(1.5);
border:1px solid color-mix(in oklab,var(--line) 80%,transparent);box-shadow:0 10px 36px rgba(0,0,0,.22),inset 0 1px 0 color-mix(in oklab,#fff 10%,transparent)}
.wzp-pill{display:flex;align-items:center;gap:8px;border-radius:999px;padding:6px 12px;cursor:pointer;color:var(--fg);font:inherit}
.wzp-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--accent)}
.wzp-dot.wzp-ok{background:var(--ok)}.wzp-dot.wzp-warn{background:var(--warn)}.wzp-dot.wzp-err{background:var(--err)}
.wzp-busy{animation:wzp-pulse 1s ease-in-out infinite}
@keyframes wzp-pulse{50%{box-shadow:0 0 0 4px color-mix(in oklab,var(--accent) 35%,transparent)}}
@media (prefers-reduced-motion:reduce){.wzp-busy{animation:none}}
.wzp-bar{display:flex;flex-wrap:wrap;align-items:stretch;gap:4px;padding:4px;border-radius:14px}
.wzp-brand{display:flex;align-items:center;gap:8px;padding:6px 10px;border:0;border-radius:10px;background:none;color:var(--fg);font:inherit;font-weight:650;cursor:pointer;
background-image:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.wzp-brand .wzp-dot{-webkit-text-fill-color:initial}
.wzp-cell{position:relative;display:flex}
.wzp-seg{flex:1;display:flex;flex-direction:column;justify-content:center;min-width:64px;padding:4px 10px;border:0;border-radius:10px;background:var(--seg);
color:var(--fg);font:inherit;text-align:left;text-decoration:none;cursor:default;outline-offset:2px}
button.wzp-seg,a.wzp-seg{cursor:pointer}
.wzp-seg:hover,.wzp-seg:focus-visible{background:color-mix(in oklab,var(--accent) 12%,transparent)}
.wzp-label{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.wzp-val{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.wzp-sub{font-weight:400;color:var(--muted);font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis}
.wzp-stack{display:flex;height:3px;margin-top:3px;border-radius:2px;overflow:hidden;background:var(--line)}
.wzp-stack i{display:block;height:100%}
.wzp-c-srv{background:var(--accent)}.wzp-c-net{background:var(--accent2)}.wzp-c-web{background:var(--warn)}
.wzp-key{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px}
.wzp-spark{display:block}
.wzp-tip{position:absolute;bottom:calc(100% + 8px);left:0;min-width:200px;max-width:280px;padding:8px 10px;border-radius:10px;font-weight:400;font-size:12px;
white-space:normal;opacity:0;transform:translateY(4px);pointer-events:none;transition:opacity .12s,transform .12s}
.wzp-tip.wzp-glass{background:color-mix(in oklab,var(--bg) 96%,transparent)}
.wzp-cell:nth-last-child(-n+3) .wzp-tip{left:auto;right:0}
.wzp-cell:hover .wzp-tip,.wzp-cell:focus-within .wzp-tip{opacity:1;transform:none}
.wzp-tip dl{display:grid;grid-template-columns:1fr auto;gap:2px 12px;margin:0}
.wzp-tip dt{color:var(--muted)}.wzp-tip dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.wzp-tip p{margin:6px 0 0;color:var(--muted)}
.wzp-open{display:flex;align-items:center;padding:0 10px;border-radius:10px;color:var(--accent);text-decoration:none;font-size:14px}
.wzp-open:hover{background:var(--seg)}
.wzp-panel{width:min(440px,calc(100vw - 32px));max-height:min(420px,60vh);display:flex;flex-direction:column;border-radius:14px;overflow:hidden}
.wzp-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--line);font-weight:600}
.wzp-head a,.wzp-head button{color:var(--accent);background:none;border:0;font:inherit;cursor:pointer;text-decoration:none;padding:0 0 0 12px}
.wzp-list{overflow:auto;margin:0;padding:0;list-style:none}
.wzp-row{display:grid;grid-template-columns:52px 1fr 44px 64px;gap:8px;align-items:center;padding:6px 12px;border-bottom:1px solid var(--line)}
.wzp-row:last-child{border-bottom:0}
.wzp-m{font-weight:600;color:var(--muted)}
.wzp-p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.wzp-p a{color:var(--fg);text-decoration:none}.wzp-p a:hover{text-decoration:underline;color:var(--accent)}
.wzp-p small{margin-left:6px;color:var(--muted);font-family:ui-sans-serif,system-ui,sans-serif}
.wzp-s{text-align:right;font-variant-numeric:tabular-nums}
.wzp-d{text-align:right;font-variant-numeric:tabular-nums;color:var(--muted)}
.wzp-ok{color:var(--ok)}.wzp-warn{color:var(--warn)}.wzp-err{color:var(--err)}
.wzp-empty{padding:16px 12px;color:var(--muted)}
`;

type Level = "wzp-ok" | "wzp-warn" | "wzp-err" | "";

function useInjectedStyle(): void {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // storage blocked: fine
  }
}

function useFlag(key: string, fallback: boolean): [boolean, () => void] {
  const [on, setOn] = useState(() => readFlag(key, fallback));
  const toggle = () =>
    setOn((o) => {
      writeFlag(key, !o);
      return !o;
    });
  return [on, toggle];
}

const statusClass = (r: RecordedRequest): Level =>
  r.error || (r.status ?? 0) >= 500 ? "wzp-err" : (r.status ?? 0) >= 400 ? "wzp-warn" : r.status ? "wzp-ok" : "";

/** "ok" at or under `good`, "warn" at or under `poor`, else "err". */
const grade = (v: number | null, good: number, poor: number): Level =>
  v === null ? "" : v <= good ? "wzp-ok" : v <= poor ? "wzp-warn" : "wzp-err";

const worst = (...levels: Level[]): Level =>
  levels.includes("wzp-err") ? "wzp-err" : levels.includes("wzp-warn") ? "wzp-warn" : levels.includes("wzp-ok") ? "wzp-ok" : "";

const ms = (v: number | null) =>
  v === null ? "…" : v < 10 ? `${v.toFixed(1)} ms` : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`;

function Segment({
  label,
  level = "",
  tip,
  href,
  onClick,
  children,
}: {
  label: string;
  level?: Level;
  tip?: ReactNode;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const tipId = useId();
  const body = (
    <>
      <span className="wzp-label">{label}</span>
      <span className={`wzp-val ${level}`}>{children}</span>
    </>
  );
  const described = tip ? tipId : undefined;
  return (
    <div className="wzp-cell">
      {href ? (
        <a className="wzp-seg" href={href} target="_blank" rel="noreferrer" aria-describedby={described}>
          {body}
        </a>
      ) : onClick ? (
        <button type="button" className="wzp-seg" onClick={onClick} aria-describedby={described}>
          {body}
        </button>
      ) : (
        <span className="wzp-seg" tabIndex={0} aria-describedby={described}>
          {body}
        </span>
      )}
      {tip && (
        <div id={tipId} role="tooltip" className="wzp-tip wzp-glass">
          {tip}
        </div>
      )}
    </div>
  );
}

function PageSegment({ page }: { page: PageStats }) {
  const { totalMs, serverMs, networkMs, browserMs } = page;
  const parts = [
    { key: "srv", label: "Server", v: serverMs },
    { key: "net", label: "Network", v: networkMs },
    { key: "web", label: "Browser", v: browserMs },
  ];
  return (
    <Segment
      label="Page"
      level={grade(totalMs, 1000, 3000)}
      tip={
        <>
          <dl>
            {parts.map((p) => (
              <Row key={p.key} label={p.label} swatch={`wzp-c-${p.key}`} value={ms(p.v)} />
            ))}
            <dt>Total</dt>
            <dd>{ms(totalMs)}</dd>
          </dl>
          <p>First page load of this tab, from the browser's navigation timing.</p>
        </>
      }
    >
      <span>
        {ms(totalMs)}
        {totalMs ? (
          <span className="wzp-stack" aria-hidden>
            {parts.map((p) => (
              <i key={p.key} className={`wzp-c-${p.key}`} style={{ width: `${((p.v ?? 0) / totalMs) * 100}%` }} />
            ))}
          </span>
        ) : null}
      </span>
    </Segment>
  );
}

function Row({ label, value, swatch }: { label: string; value: ReactNode; swatch?: string }) {
  return (
    <>
      <dt>
        {swatch && <span className={`wzp-key ${swatch}`} />}
        {label}
      </dt>
      <dd>{value}</dd>
    </>
  );
}

function Sparkline({ requests }: { requests: readonly RecordedRequest[] }) {
  const points = requests.slice(0, 24).reverse();
  const max = Math.max(1, ...points.map((r) => r.durationMs ?? 0));
  const w = 4;
  const gap = 2;
  return (
    <svg className="wzp-spark" width={points.length * (w + gap)} height={16} aria-hidden>
      {points.map((r, i) => {
        // Square root keeps one slow call from flattening all the others.
        const h = Math.max(2, Math.sqrt((r.durationMs ?? 0) / max) * 16);
        return <rect key={r.id} className={statusClass(r) || "wzp-d"} x={i * (w + gap)} y={16 - h} width={w} height={h} rx={1} fill="currentColor" />;
      })}
    </svg>
  );
}

/** Start the monitor in an effect, so a StrictMode remount gets a fresh one. Buffered entries replay. */
function usePageStats(): PageStats {
  const [stats, setStats] = useState(EMPTY_PAGE_STATS);
  useEffect(() => {
    const monitor = createPageMonitor();
    const sync = () => setStats(monitor.getSnapshot());
    sync();
    const unsubscribe = monitor.subscribe(sync);
    return () => {
      unsubscribe();
      monitor.stop();
    };
  }, []);
  return stats;
}

export function Hud({ recorder }: { recorder: Recorder }) {
  useInjectedStyle();
  const requests = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, recorder.getSnapshot);
  const page = usePageStats();
  const [open, toggleOpen] = useFlag(OPEN_KEY, false);
  const [bar, toggleBar] = useFlag(BAR_KEY, true);

  const busy = requests.some((r) => r.durationMs === null && !r.error);
  const errors = requests.filter((r) => statusClass(r) === "wzp-err").length;
  const host = requests.find((r) => r.profiled);
  const srv = host?.server;
  const srvLevel = worst(grade(srv?.durationMs ?? null, 300, 1000), srv?.errorCount ? "wzp-err" : "");
  const dbLevel = srv ? grade(srv.dbCount, 9, 24) : "";
  const callsLevel: Level = errors > 0 ? "wzp-err" : requests.length ? "wzp-ok" : "";
  const vitals = {
    lcp: grade(page.lcpMs, 2500, 4000),
    inp: grade(page.inpMs, 200, 500),
    cls: grade(page.cls, 0.1, 0.25),
  };
  const health = worst(grade(page.totalMs, 1000, 3000), srvLevel, dbLevel, callsLevel, vitals.lcp, vitals.inp, vitals.cls);
  const dot = <span className={`wzp-dot ${health}${busy ? " wzp-busy" : ""}`} />;

  return (
    <div className="wzp-hud" role="complementary" aria-label="WizeLens">
      {open && (
        <div className="wzp-panel wzp-glass">
          <div className="wzp-head">
            <span>WizeLens · {requests.length} requests</span>
            <span>
              <button type="button" onClick={recorder.clear}>
                Clear
              </button>
              <a href={`${recorder.endpointUrl}/`} target="_blank" rel="noreferrer">
                Dashboard ↗
              </a>
            </span>
          </div>
          {requests.length === 0 ? (
            <div className="wzp-empty">No requests yet. Use the app and they show up here.</div>
          ) : (
            <ul className="wzp-list">
              {requests.map((r) => (
                <li key={r.id} className="wzp-row" title={r.error ?? r.url}>
                  <span className="wzp-m">{r.method}</span>
                  <span className="wzp-p">
                    {r.profiled ? (
                      <a href={recorder.traceLink(r.traceId)} target="_blank" rel="noreferrer">
                        {r.path}
                      </a>
                    ) : (
                      r.path
                    )}
                    {r.server && r.server.dbCount > 0 && <small>{r.server.dbCount} db</small>}
                  </span>
                  <span className={`wzp-s ${statusClass(r)}`}>{r.error ? "ERR" : (r.status ?? "…")}</span>
                  <span className="wzp-d">{ms(r.durationMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {bar ? (
        <div className="wzp-bar wzp-glass" role="toolbar" aria-label="WizeLens stats">
          <button type="button" className="wzp-brand" onClick={toggleBar} title="Collapse WizeLens">
            {dot}
            WizeLens
          </button>
          <PageSegment page={page} />
          <Segment
            label="Server"
            level={srvLevel}
            href={host ? recorder.traceLink(host.traceId) : undefined}
            tip={
              host ? (
                <>
                  <dl>
                    <Row label="Request" value={`${host.method} ${host.status ?? "…"}`} />
                    <Row label="Server time" value={ms(srv?.durationMs ?? null)} />
                    <Row label="Round trip" value={ms(host.durationMs)} />
                    <Row label="HTTP calls out" value={srv?.httpClientCount ?? "…"} />
                    <Row label="Error spans" value={srv?.errorCount ?? "…"} />
                    <Row label="Services" value={srv?.services.join(", ") || "…"} />
                  </dl>
                  <p>Last profiled request. Click to open its trace.</p>
                </>
              ) : (
                <p>No profiled request yet.</p>
              )
            }
          >
            {host ? (
              <>
                {ms(srv?.durationMs ?? host.durationMs)}
                <span className="wzp-sub">{srv?.name ?? `${host.method} ${host.path}`}</span>
              </>
            ) : (
              "—"
            )}
          </Segment>
          <Segment
            label="DB"
            level={dbLevel}
            tip={
              srv ? (
                <>
                  <dl>
                    <Row label="Queries" value={srv.dbCount} />
                    <Row label="Query time" value={ms(srv.dbMs)} />
                  </dl>
                  <p>For the last profiled request. Many queries in one request can mean an N+1 problem.</p>
                </>
              ) : (
                <p>No DB data yet.</p>
              )
            }
          >
            {srv ? (
              <>
                {srv.dbCount}
                {srv.dbMs !== null && <span className="wzp-sub">{ms(srv.dbMs)}</span>}
              </>
            ) : (
              "—"
            )}
          </Segment>
          <Segment
            label="Calls"
            level={callsLevel}
            onClick={toggleOpen}
            tip={
              <>
                <dl>
                  <Row label="Requests" value={requests.length} />
                  <Row label="Failed" value={errors} />
                  <Row label="Slowest" value={ms(Math.max(0, ...requests.map((r) => r.durationMs ?? 0)) || null)} />
                </dl>
                <p>Fetch calls from this tab. Click to {open ? "hide" : "show"} the list.</p>
              </>
            }
          >
            {requests.length}
            {errors > 0 && <span className="wzp-err">{errors} err</span>}
            <Sparkline requests={requests} />
          </Segment>
          <Segment
            label="Vitals"
            level=""
            tip={
              <>
                <dl>
                  <Row label="LCP · main content shown" value={<span className={vitals.lcp}>{ms(page.lcpMs)}</span>} />
                  <Row label="INP · slowest interaction" value={<span className={vitals.inp}>{ms(page.inpMs)}</span>} />
                  <Row label="CLS · layout shift" value={<span className={vitals.cls}>{page.cls?.toFixed(3) ?? "…"}</span>} />
                </dl>
                <p>Good: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.</p>
              </>
            }
          >
            <span className={vitals.lcp}>{ms(page.lcpMs)}</span>
            <span className={vitals.inp}>{page.inpMs === null ? "—" : ms(page.inpMs)}</span>
            <span className={vitals.cls}>{page.cls === null ? "—" : page.cls.toFixed(2)}</span>
          </Segment>
          <a className="wzp-open" href={`${recorder.endpointUrl}/`} target="_blank" rel="noreferrer" title="Open the dashboard">
            ↗
          </a>
        </div>
      ) : (
        <button type="button" className="wzp-pill wzp-glass" onClick={toggleBar} title="Show WizeLens stats">
          {dot}
          <span>WizeLens</span>
          {host && <span className={srvLevel}>{ms(srv?.durationMs ?? host.durationMs)}</span>}
          {errors > 0 && <span className="wzp-err">· {errors} err</span>}
        </button>
      )}
    </div>
  );
}
