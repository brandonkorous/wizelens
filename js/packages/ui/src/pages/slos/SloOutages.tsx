import { incidentMs, outagesIn, type SloReport, type UptimeIncidentView, type UptimeList } from "@wizeworks/lens-core";
import { useHost } from "../../data/host";
import { uptimeListUrl } from "../../data/uptime";
import { useApi } from "../../data/useApi";
import { fmtDateTime } from "../../format";
import { hrefTo } from "../../routes";
import type { ChartOutage } from "../../ui/OutageBands";
import { fmtLength } from "../uptime/uptimeParts";

/** The project's uptime incidents inside the SLO's window; empty without uptime checks. */
export function useSloOutages(r: SloReport): UptimeIncidentView[] {
  const host = useHost();
  const { data } = useApi<UptimeList>(host.has("uptime") ? uptimeListUrl(host.has("accounts")) : null);
  const from = r.status.starts[0];
  if (!data || from === undefined) return [];
  return outagesIn(data.incidents, from, data.nowMs);
}

export const chartOutages = (list: readonly UptimeIncidentView[]): ChartOutage[] => list.map((i) => ({ startMs: i.startMs, endMs: i.endMs, label: `${i.checkName} down` }));

/** Outages listed by name; the rest are on Uptime. */
const SHOWN = 5;

/** Why an outage spends no budget, and the outages Uptime saw in this window. */
export function SloOutages({ r, outages }: { r: SloReport; outages: readonly UptimeIncidentView[] }) {
  const service = r.slo.service;
  if (outages.length === 0) {
    return <p className="wl-muted wl-small">Counts the requests {service} answered. While it is down it answers none, so an outage spends no budget here: an <a href={hrefTo("uptime")}>uptime check</a> catches it.</p>;
  }
  const now = Date.now();
  const more = outages.length - SHOWN;
  return (
    <div className="wl-banner wl-banner-warning" role="note">
      <p><strong>Uptime saw {outages.length === 1 ? "an outage" : `${outages.length} outages`} in this window.</strong> These minutes spend no budget here: while {service} is down it answers no requests, so this SLO cannot count them. The red bands on the charts show them.</p>
      <ul className="wl-outage-list">
        {outages.slice(-SHOWN).map((i) => (
          <li key={i.id}>
            <a href={hrefTo("uptime", [i.checkId])}>{i.checkName}</a> down {fmtDateTime(i.startMs)}{i.endMs === null ? ", still down" : ` for ${fmtLength(incidentMs(i, now))}`}: {i.reason}
          </li>
        ))}
        {more > 0 && <li><a href={hrefTo("uptime")}>{more} earlier on Uptime</a></li>}
      </ul>
    </div>
  );
}
