import type { ComponentType } from "react";
import { DatabaseArt } from "./tiles/DatabaseArt";
import { RenderArt } from "./tiles/RenderArt";
import { ErrorArt } from "./tiles/ErrorArt";
import { LogsArt } from "./tiles/LogsArt";
import { MetricsArt } from "./tiles/MetricsArt";
import { ServicesArt } from "./tiles/ServicesArt";
import { SearchArt } from "./tiles/SearchArt";
import { SamplingArt } from "./tiles/SamplingArt";
import { RedactArt } from "./tiles/RedactArt";
import { SecurityArt } from "./tiles/SecurityArt";
import { TagsArt } from "./tiles/TagsArt";
import { UsersArt } from "./tiles/UsersArt";
import { UptimeArt } from "./tiles/UptimeArt";
import { SloArt } from "./tiles/SloArt";

export type BentoTile = { area: string; title: string; body: string; night?: boolean; Art: ComponentType<{ seen: boolean }> };

// Every bento cell in grid order; bento.css places each one by its area.
export const TILES: BentoTile[] = [
  { area: "db", title: "Every query, from any ORM.", body: "EF Core, Dapper, Prisma, Drizzle, TypeORM, or the raw driver. Each statement with its time and where it came from.", Art: DatabaseArt },
  { area: "rd", title: "Renders, timed per component.", body: "React renders, hydration, and Web Vitals for each page.", Art: RenderArt },
  { area: "er", title: "Errors, with the request around them.", body: "The stack, the request, and the spans that led to it. Browser stacks map back to your source. Resolve or ignore a group, see it come back as regressed, and filter to what is new in this release.", Art: ErrorArt },
  { area: "lg", title: "Logs from every logger.", body: "Serilog, NLog, ILogger, pino, winston, bunyan, console, and more, linked to their trace. Startup and background lines too, grouped into patterns you can chart and alert on.", night: true, Art: LogsArt },
  { area: "mt", title: "Metrics next to the traces.", body: "CPU, memory, GC, and your own OpenTelemetry counters, per service, host, and pod. Build your own dashboards from them.", Art: MetricsArt },
  { area: "sv", title: "Who calls whom.", body: "Every service, database, and outside host, on one map.", Art: ServicesArt },
  { area: "ck", title: "Ctrl K finds it.", body: "One search language everywhere: status:5xx duration:>1s @user.id:42. Ctrl K also finds error groups, queries, insights, metrics, alerts, SLOs, and saved views.", Art: SearchArt },
  { area: "tg", title: "Name a search. It becomes a tag.", body: "Everything the search finds wears the tag in every list: requests, traces, logs, errors, services, and users. probe, bot, and stream come built in.", Art: TagsArt },
  { area: "us", title: "Who it hit, by name.", body: "Every signed-in user with their requests, failures, and latency. Errors and endpoints show how many users they touched.", Art: UsersArt },
  { area: "up", title: "Know when it is down.", body: "Uptime checks call your URLs every 1 to 60 minutes, from the hub or the cloud. Certificate warnings, and a public status page in the cloud.", night: true, Art: UptimeArt },
  { area: "sl", title: "Error budgets, not guesses.", body: "An SLO says how much traffic must succeed, or be fast enough, over 7 or 30 days. See the budget left and how fast it burns, and alert on the burn rate.", Art: SloArt },
  { area: "sm", title: "Keep a share. Keep every error.", body: "Sampling picks the same traces in every service. A trace with an error or a slow span is always kept.", Art: SamplingArt },
  { area: "rx", title: "Secrets never get stored.", body: "Passwords, tokens, cookies, and connection strings are redacted before anything is written.", Art: RedactArt },
  { area: "sc", title: "Security risks, from real traffic.", body: "SQL built from input, missing headers, cookies without flags, secrets in URLs and logs, open admin routes, sign-in guessing, and known-vulnerable packages. Mapped to the OWASP Top 10, with the release that brought each one in.", night: true, Art: SecurityArt },
];
