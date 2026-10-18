---
title: Production
description: Turn WizeLens on in production to send traces to your cloud or hub. The app itself serves nothing anyone can read.
---

## Turn it on

WizeLens is off in production until you turn it on. Set these on each service and restart it:

```bash
WIZELENS_ENABLED=true
WIZELENS_HUB=https://app.wizelens.com
WIZELENS_HUB_TOKEN=wl_ik_...                   # one ingest key per service
WIZELENS_SAMPLE_RATE=0.25                      # optional, see Sampling
```

No code change is needed. `Enabled = true` (.NET) or `enabled: true` (Node) does the same as `WIZELENS_ENABLED`.

## Send-only

Outside development the add-on is **send-only**. It captures every request, query, log, and browser span, and sends them
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

Hide the HUD, and keep sending page loads, React renders, and browser errors:

```tsx
<WizeLensProvider hud={false}>
  <App />
</WizeLensProvider>
```

With `hud={false}` the browser never reads traces back, so it works with a send-only server.

## One key per service

Each server sends a batch every second. The cloud takes at most 1200 calls per key per minute, so give each service its
own ingest key, all in the same project. One project keeps a trace whole when it crosses services.
