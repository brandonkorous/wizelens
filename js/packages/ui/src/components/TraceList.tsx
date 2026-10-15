import { useEffect, useMemo, useState } from "react";
import type { TraceSummary } from "@wizeworks/lens-core";
import { api } from "../api";
import { fmtAgo, fmtClock, fmtMs, serviceSlot } from "../format";

const codeClass = (code: number) => (code >= 500 ? "code-err" : code >= 400 ? "code-warn" : "code-ok");

const POLL_MS = 2000;

export function TraceList() {
  const [traces, setTraces] = useState<TraceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [query, setQuery] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .traces()
        .then((t) => {
          if (cancelled) return;
          setTraces(t);
          setError(null);
          setNow(Date.now());
        })
        .catch((e: unknown) => !cancelled && setError(String(e)));
    void load();
    if (!live) return () => void (cancelled = true);
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [live]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (traces ?? []).filter(
      (t) =>
        (!errorsOnly || t.status === "error") &&
        (!q || t.rootName.toLowerCase().includes(q) || t.services.some((s) => s.toLowerCase().includes(q)) || t.traceId.startsWith(q)),
    );
  }, [traces, query, errorsOnly]);

  const maxDuration = Math.max(1, ...visible.map((t) => t.durationMs));
  const allServices = useMemo(() => [...new Set((traces ?? []).flatMap((t) => t.services))].sort(), [traces]);

  return (
    <section className="panel">
      <div className="toolbar">
        <h1>Requests</h1>
        <input
          className="search"
          type="search"
          placeholder="Filter by route, service, or trace id"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter requests"
        />
        <label className="toggle">
          <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />
          Errors only
        </label>
        <button type="button" className={`btn ${live ? "btn-live" : ""}`} onClick={() => setLive((l) => !l)} aria-pressed={live}>
          <span className={`live-dot ${live ? "on" : ""}`} />
          {live ? "Live" : "Paused"}
        </button>
      </div>

      {error && <div className="banner banner-error">Could not load traces: {error}</div>}

      {traces === null ? (
        <div className="empty">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="empty">
          {traces.length === 0 ? (
            <>
              <strong>No requests yet.</strong>
              <span>Use your app. Each request shows up here within 2 seconds.</span>
            </>
          ) : (
            "No requests match the filter."
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table traces">
            <thead>
              <tr>
                <th>Time</th>
                <th>Request</th>
                <th>Services</th>
                <th className="num">Duration</th>
                <th className="num">DB</th>
                <th className="num">HTTP</th>
                <th className="num">Spans</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr
                  key={t.traceId}
                  className={t.status === "error" ? "row-error" : undefined}
                  onClick={() => (window.location.hash = `#/traces/${t.traceId}`)}
                >
                  <td className="time" title={new Date(t.startMs).toISOString()}>
                    <div>{fmtClock(t.startMs)}</div>
                    <div className="muted small">{fmtAgo(t.startMs, now)}</div>
                  </td>
                  <td className="name">
                    <a href={`#/traces/${t.traceId}`} onClick={(e) => e.stopPropagation()}>
                      {t.status === "error" && <span className="status-dot error" aria-label="error" />}
                      {t.rootName}
                    </a>
                    <div className="muted small mono">
                      {t.rootMethod != null && !t.rootName.startsWith(`${t.rootMethod} `) && (
                        <span className="req-method">{t.rootMethod}</span>
                      )}
                      {t.rootStatusCode != null && (
                        <span className={`req-code ${codeClass(t.rootStatusCode)}`}>{t.rootStatusCode}</span>
                      )}
                      {t.traceId.slice(0, 12)}…
                    </div>
                  </td>
                  <td>
                    <div className="chips">
                      {t.services.map((s) => (
                        <span key={s} className={`chip svc svc-${serviceSlot(s, allServices)}`}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="num">
                    <div className="duration-cell">
                      <span>{fmtMs(t.durationMs)}</span>
                      <span className="mini-bar">
                        <span style={{ width: `${Math.max(2, (t.durationMs / maxDuration) * 100)}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className="num">{t.dbCount || <span className="muted">–</span>}</td>
                  <td className="num">{t.httpClientCount || <span className="muted">–</span>}</td>
                  <td className="num">
                    {t.spanCount}
                    {t.errorCount > 0 && <span className="chip chip-error small-chip">{t.errorCount} err</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
