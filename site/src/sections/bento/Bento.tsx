"use client";

import { Tile } from "./Tile";
import { DatabaseArt } from "./tiles/DatabaseArt";
import { RenderArt } from "./tiles/RenderArt";
import { ErrorArt } from "./tiles/ErrorArt";
import { LogsArt } from "./tiles/LogsArt";
import { MetricsArt } from "./tiles/MetricsArt";
import { ServicesArt } from "./tiles/ServicesArt";
import { SearchArt } from "./tiles/SearchArt";
import { SamplingArt } from "./tiles/SamplingArt";
import { RedactArt } from "./tiles/RedactArt";

export function Bento() {
  return (
    <section className="wl-section" id="inside">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">Everything a request touched.</h2>
          <p className="wl-lede">
            Ten dashboard pages, one look. Requests, traces, database, rendering, errors, logs, metrics, services, and
            insights, for one service or all of them.
          </p>
        </div>
        <div className="wl-bento">
          <Tile area="db" title="Every query, from any ORM." body="EF Core, Dapper, Prisma, Drizzle, TypeORM, or the raw driver. Each statement with its time and where it came from.">
            {(seen) => <DatabaseArt seen={seen} />}
          </Tile>
          <Tile area="rd" title="Renders, timed per component." body="React renders, hydration, and Web Vitals for each page.">
            {(seen) => <RenderArt seen={seen} />}
          </Tile>
          <Tile area="er" title="Errors, with the request around them." body="The stack, the request, and the spans that led to it. Browser errors too.">
            {(seen) => <ErrorArt seen={seen} />}
          </Tile>
          <Tile area="lg" title="Logs from every logger." body="Serilog, NLog, ILogger, pino, winston, bunyan, console, and more, linked to their trace." night>
            {(seen) => <LogsArt seen={seen} />}
          </Tile>
          <Tile area="mt" title="Metrics next to the traces." body="CPU, memory, GC, and your own OpenTelemetry counters, per service.">
            {(seen) => <MetricsArt seen={seen} />}
          </Tile>
          <Tile area="sv" title="Who calls whom." body="Every service, database, and outside host, on one map.">
            {(seen) => <ServicesArt seen={seen} />}
          </Tile>
          <Tile area="ck" title="Ctrl K finds it." body="Search requests, traces, errors, and services.">
            {(seen) => <SearchArt seen={seen} />}
          </Tile>
          <Tile area="sm" title="Keep a share. Keep every error." body="Sampling picks the same traces in every service. A trace with an error or a slow span is always kept.">
            {(seen) => <SamplingArt seen={seen} />}
          </Tile>
          <Tile area="rx" title="Secrets never get stored." body="Passwords, tokens, cookies, and connection strings are redacted before anything is written.">
            {(seen) => <RedactArt seen={seen} />}
          </Tile>
        </div>
      </div>
    </section>
  );
}
