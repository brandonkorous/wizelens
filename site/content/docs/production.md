---
title: Production
description: Turn WizeLens on in production to send traces to your cloud or hub. The app itself serves nothing anyone can read.
---

## Turn it on

The .NET and Node add-ons are off in production until you turn them on. Set these on each service and restart it:

```bash
WIZELENS_ENABLED=true
WIZELENS_ENDPOINT=https://app.wizelens.com
WIZELENS_TOKEN=wl_ik_...                       # one ingest key per service
WIZELENS_SAMPLE_RATE=0.25                      # optional, see Sampling
```

No code change is needed. `Enabled = true` (.NET) or `enabled: true` (Node) does the same as `WIZELENS_ENABLED`.

The Java, Python, and Go SDKs are on wherever they run, and they only send. Set `WIZELENS_ENDPOINT` and `WIZELENS_TOKEN` as
above; `WIZELENS_ENABLED=false` stops them. The browser package is on unless you pass `enabled: false`.

## Send-only

Outside development the .NET and Node add-ons are **send-only**. It captures every request, query, log, and browser span, and sends them
to the cloud or hub. It serves no dashboard, read API, or MCP, so nobody can read traces from the app itself.

| Path under `/_wizelens` | Send-only |
|---|---|
| `POST api/client-spans` (browser spans) | Answers |
| Dashboard, `api/info`, `api/traces`, metrics, MCP | 404 |

Traces stay in memory only, until they are sent. The cloud gets no address to read from the app.
"Outside development" means outside the Development environment (.NET) or with `NODE_ENV=production` (Node, Next.js).

To serve the dashboard anyway, for example on a staging server behind a VPN, set `WIZELENS_DASHBOARD=true`
(`Dashboard = true` / `dashboard: true`).

## The browser

A send-only add-on puts no HUD on the pages it serves, and its `api/info` answers 404. So Vue, Angular, Svelte, and plain
JS (`hud: "auto"`, the default) show no HUD in production, read nothing back, and keep sending page loads and browser
errors.

React shows the HUD unless you hide it. Hide it, and keep sending page loads, React renders, and browser errors:

```tsx
<WizeLensProvider hud={false}>
  <App />
</WizeLensProvider>
```

With `hud={false}` (React) or `hud: false` (the other packages) the browser never reads traces back, so it works with a
send-only server.

## One key per service

Each server sends a batch every second. The cloud takes at most 1200 calls per key per minute, so give each service its
own ingest key, all in the same project. One project keeps a trace whole when it crosses services.
