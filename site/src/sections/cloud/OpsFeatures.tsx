"use client";

import { Tile } from "@/sections/bento/Tile";
import { ScaleArt } from "./tiles/DataTiles";
import { ErrorsArt, HostsArt, PackagesArt } from "./tiles/FixTiles";
import { ProblemsArt, SloArt, UptimeArt } from "./tiles/OpsTiles";
import { AlertsArt } from "./tiles/TeamTiles";

// The production side of the cloud: alerts, problems, uptime, SLOs, errors, security, hosts, and scale.
export function OpsFeatures() {
  return (
    <section className="wl-section">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">Know when it breaks, and why.</h2>
          <p className="wl-lede">The cloud watches every project for you, day and night, and tells the right people.</p>
        </div>
        <div className="wl-bento wl-cloud-ops">
          <Tile area="al" title="Alerts that say what happened." body="Error rate, latency, traffic, new errors, slow queries, log searches, security risks, SLO burn, any metric, or anything above normal. To Slack, Teams, Discord, PagerDuty, email, or webhooks, when it fires and when it clears.">{(s) => <AlertsArt seen={s} />}</Tile>
          <Tile area="pr" title="Problems, with a suspected cause." body="Each service and endpoint is held against the same hour in the 4 weeks before. What breaks together is one problem, and every alert links to it. Plain statistics, no AI." night>{(s) => <ProblemsArt seen={s} />}</Tile>
          <Tile area="up" title="Uptime checks and status pages." body="The cloud calls your URLs every 1 to 60 minutes and warns before a certificate ends. Each project can turn on a public status page.">{(s) => <UptimeArt seen={s} />}</Tile>
          <Tile area="sl" title="SLOs and dashboards." body="Say how much traffic must succeed or be fast enough, over 7 or 30 days, and watch the error budget. Apdex per service, and dashboards of the metrics you pick.">{(s) => <SloArt seen={s} />}</Tile>
          <Tile area="er" title="Errors you can close." body="Assign an error group, resolve it, or ignore it for an hour, a day, a week, or for good. A resolved error that comes back shows as Regressed.">{(s) => <ErrorsArt seen={s} />}</Tile>
          <Tile area="se" title="Security, from real traffic." body="Risks mapped to the OWASP Top 10, and packages with known vulnerabilities, checked against OSV. Only names and versions are sent.">{(s) => <PackagesArt seen={s} />}</Tile>
          <Tile area="sc" title="Fast with a lot of data." body="Scale mode keeps telemetry in ClickHouse and accounts in Postgres. Measured with one cloud process." night>{(s) => <ScaleArt seen={s} />}</Tile>
          <Tile area="ho" title="Hosts and Kubernetes." body="Run the standard OpenTelemetry Collector with our Helm chart. CPU, memory, disk, and network per host; pods, restarts, and out-of-memory kills per cluster. No WizeLens agent.">{(s) => <HostsArt seen={s} />}</Tile>
        </div>
      </div>
    </section>
  );
}
