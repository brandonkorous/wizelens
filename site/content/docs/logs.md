---
title: Logs
description: Every log line, in requests and outside them, grouped into patterns, charted from saved searches, and watched by alerts.
---

The **Logs** page shows every line your services write through a logger WizeLens reads: in a request, and outside one
(startup, background jobs, timers). Filter by level, service, text, category, pattern, and where it was written.

## Lines outside a request

Lines written while no request runs are kept too, with their service and level. The **Request** column says
"Outside a request" for them. Three options keep the volume in check. They apply only to lines outside a request; lines in
a request are always kept with their trace.

| Setting | .NET | Node | Environment variable | Default |
|---|---|---|---|---|
| Keep lines outside a request | `Logs.Outside` | `logs.outside` | `WIZELENS_LOGS_OUTSIDE` | on |
| Lowest level kept | `Logs.MinLevel` | `logs.minLevel` | `WIZELENS_LOGS_MIN_LEVEL` | `Information` / `"info"` |
| Share kept below warn (0 to 1) | `Logs.SampleRate` | `logs.sampleRate` | `WIZELENS_LOGS_SAMPLE_RATE` | `1` |

Warnings and up are always kept, whatever the sample rate. Trace sampling does not apply to these lines.

```ts
createWizeLens({ serviceName: "orders-api", logs: { minLevel: "warn", sampleRate: 0.2 } });
```

```csharp
builder.Services.AddWizeLens(o => { o.Logs.MinLevel = LogLevel.Warning; o.Logs.SampleRate = 0.2; });
```

Every logger WizeLens reads does this: `ILogger`, Serilog, and NLog on .NET; `console`, pino, winston, bunyan, log4js,
consola, NestJS, and OpenTelemetry logs on Node. OpenTelemetry apps that send log records with no trace id to the hub or
the cloud get the same treatment.

## Patterns

**Log Patterns** groups lines that differ only in numbers, ids, uuids, and quoted values. `Job 4012 for tenant 'acme'`
and `Job 4013 for tenant 'beta'` are one pattern, `Job <num> for tenant <str>`. Each pattern shows its count, its share of
the lines, the change against the time before, and a trend. Click a pattern to show only its lines; click it again to show
them all. Patterns follow the level, service, and "written" filters.

## Log metrics

Filter the lines, then **Save this search**. Each saved search becomes a chart of its matching lines over the time range,
with errors on top and its total against the time before. **Show lines** puts its filters back. The hub and the cloud keep
these charts as saved searches, next to your saved views: they show under **Saved** in the sidebar, on the Search page, and
in Ctrl+K. The hub shares them with everyone; on the cloud they are shared with the project unless you clear **Share with
the team**, and only the person who saved one (or an admin) deletes it. Saving a Logs page from the star in the top bar can
chart it too (**Chart it on the Logs page**). An app's own dashboard keeps them in your browser.

## Log alerts

On the hub and the cloud, **Alert on this search** (or a new alert with **Log lines**) counts the lines that match a
search over 5 minutes to 24 hours, and fires when the count is above or below your threshold:

```text
Log lines (error and up, "timed out") is 12 (above 10)
```

See [Alerts](/docs/alerts/) for channels, reminders, and muting.

## How long logs are kept

Logs can be kept for more or less time than traces.

- **Cloud:** each project has its own log retention under **Team → Projects → Logs kept** (1 to 400 days), or follows the
  organization's.
- **Hub:** `--log-retention <time>` (`WIZELENS_HUB_LOG_RETENTION`), else the same as `--retention`.

Lines outside a request are kept for the log retention. Lines in a request are kept for the log retention too, but never
longer than their trace.
