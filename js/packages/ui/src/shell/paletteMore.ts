// Ctrl+K hits beyond requests and logs: error groups, queries, insights, metrics, alerts, SLOs, and saved items.
import { useEffect, useState } from "react";
import { errorText, type MetricsModel, type SavedItem, type SloReport, type TimeRange } from "@wizeworks/lens-core/internal";
import { apiFetch } from "../data/api";
import { useHost } from "../data/host";
import { loadPageModel } from "../data/models";
import { useSavedApi } from "../data/saved";
import { useAlertsApi, type AlertsData } from "../pages/alerts/alertTypes";
import { useSlosApi } from "../pages/slos/sloTypes";
import { alertHref, errorHref, hrefTo, queryHref, sloHref } from "../routes";
import type { SearchHit } from "./searchIndex";
import { savedHref } from "../data/saved";
import { dashboardHref } from "../routes";

const DELAY_MS = 220;
const EACH = 3;
const has = (text: string, q: string) => text.toLowerCase().includes(q.toLowerCase());
const quiet = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

type Urls = { alerts: string | null; slos: string | null; saved: string | null; metrics: boolean };

/** Every source for the text, each one allowed to fail on its own. */
async function hitsFor(q: string, range: TimeRange, server: boolean, u: Urls): Promise<SearchHit[]> {
  const page = { q, size: "5", page: "1" };
  const [errors, db, insights, security, metrics, alerts, slos, saved] = await Promise.all([
    quiet(loadPageModel("errors", { ...page, status: "all" }, range, server)),
    quiet(loadPageModel("database", page, range, server)),
    quiet(loadPageModel("insights", { q }, range, server)),
    quiet(loadPageModel("security", { q }, range, server)),
    u.metrics ? quiet(apiFetch<MetricsModel>(`./api/models/metrics?range=${range}&q=${encodeURIComponent(q)}`)) : null,
    u.alerts ? quiet(apiFetch<AlertsData>(u.alerts)) : null,
    u.slos ? quiet(apiFetch<{ slos: SloReport[] }>(u.slos)) : null,
    u.saved ? quiet(apiFetch<{ items: SavedItem[] }>(u.saved)) : null,
  ]);
  return [
    ...(errors?.groups ?? []).slice(0, EACH).map((g): SearchHit => ({ key: `eg${g.key}`, kind: "error", title: errorText(g), detail: `Error group · ${g.service}`, href: errorHref(g.key) })),
    ...(db?.queries ?? []).slice(0, EACH).map((x): SearchHit => ({ key: `q${x.key}`, kind: "query", title: x.query, detail: `Query · ${x.count} runs`, href: queryHref(x.query) })),
    ...(insights?.groups ?? []).slice(0, EACH).map((g): SearchHit => ({ key: `i${g.key}`, kind: "insight", title: g.title, detail: g.shape, href: hrefTo("insights", [], { key: g.key }) })),
    ...(security?.groups ?? []).slice(0, EACH).map((g): SearchHit => ({ key: `s${g.key}`, kind: "security", title: g.title, detail: `${g.owasp} · ${g.shape}`, href: hrefTo("security", [], { key: g.key }) })),
    ...(metrics?.catalog ?? []).slice(0, EACH).map((m): SearchHit => ({ key: `m${m.name}`, kind: "metric", title: m.name, detail: `Metric · ${m.lastText}`, href: hrefTo("metrics", [], { metric: m.name }) })),
    ...(alerts?.rules ?? []).filter((r) => has(r.name, q)).slice(0, EACH).map((r): SearchHit => ({ key: `a${r.id}`, kind: "alert", title: r.name, detail: `Alert · ${r.state === "firing" ? "Firing" : "OK"}`, href: alertHref(r.id) })),
    ...(slos?.slos ?? []).filter((s) => has(s.slo.name, q)).slice(0, EACH).map((s): SearchHit => ({ key: `o${s.slo.id}`, kind: "slo", title: s.slo.name, detail: "SLO", href: sloHref(s.slo.id) })),
    ...(saved?.items ?? []).filter((i) => has(i.name, q)).slice(0, EACH).map((i): SearchHit => ({ key: `v${i.id}`, kind: "saved", title: i.name, detail: i.kind === "dashboard" ? "Dashboard" : i.kind === "search" ? "Saved search" : "Saved view", href: i.kind === "dashboard" ? dashboardHref(i.id, i.projectId) : savedHref(i) })),
  ];
}

/** The extra hits for the typed text, after a short pause. */
export function usePaletteMore(query: string, range: TimeRange, server: boolean): SearchHit[] {
  const host = useHost();
  const alerts = useAlertsApi();
  const slos = useSlosApi();
  const saved = useSavedApi();
  const urls: Urls = {
    alerts: host.has("alerts") && alerts.ready ? alerts.url() : null,
    slos: host.has("slos") && slos.ready ? slos.url() : null,
    saved: saved.on && saved.ready ? saved.url() : null,
    metrics: host.has("serverMetrics"),
  };
  const key = JSON.stringify(urls);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const q = query.trim();
  useEffect(() => {
    setHits([]);
    if (q.length < 2) return;
    let live = true;
    const timer = setTimeout(() => void hitsFor(q, range, server, JSON.parse(key) as Urls).then((h) => live && setHits(h)), DELAY_MS);
    return () => ((live = false), clearTimeout(timer));
  }, [q, range, server, key]);
  return hits;
}
