# 050 — Every time Dani leaves a board, Requests says the live-updates call was Aborted, and counts its seconds as slow

**Status:** fixed
**Severity:** major
**Found by:** P01 · kanNINJA dev · RULE #7 regression of #029 (API dashboard, `localhost:3001/_wizelens`)
**Surface:** Requests (list and side panel), Overview / Services latency, every host (in-app, hub, cloud)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran the P01 step — kanNINJA API restarted with the fixed add-on, Dani opened the Q4 Workshop board and left: Requests › `realtime` on `localhost:3001/_wizelens` lists `GET /api/v1/realtime?ticket=v1.[redacted:signed-token] · 101 · 0.80 ms` (4:34:45 AM), under the two from before the fix (Aborted 6.06 s, 7.58 s). Greta sees the same row in the cloud (Cloud › Requests). node tests 290 pass
**Blocked on:** —

## What Dani saw

Dani opened the Q4 Workshop board and left. Requests › `realtime` listed
`GET /api/v1/realtime?ticket=v1.[redacted:signed-token] · Aborted · 6.06 s`, and the visit before it
`Aborted · 7.58 s`. Nothing was aborted: the board's live updates (a WebSocket) were open while Dani looked
at the board and closed when Dani left, as they should. "Aborted" says the browser gave up on a request,
which sends a developer to look for a network fault that is not there. The 6–7 s were also counted as
request time, so `kanninja-backend`'s average and p95 latency carried every board visit's whole length.

## Where it lives

`js/packages/node/src/request-capture.ts`. `@fastify/websocket` routes an upgrade through Fastify with a
stand-in `ServerResponse` that never sends a status; `ws` then writes `HTTP/1.1 101 Switching Protocols`
straight to the socket. The add-on only reads the response, so it saw "no status was sent" and marked the
request aborted. With no 101 and no stream mark, `core` counted the whole span as request time. The .NET
add-on never sets the aborted flag (#034).

## Fix

- `node/src/upgrade-tap.ts`: for a request with an `Upgrade` header, read the first write on its socket once.
  When it is a status line, keep the status and the time it was written, then put `socket.write` back.
- `request-capture.ts`: when no status went through the response, use the socket's. A `101` marks the span a
  stream with its first byte, so it is not aborted and only the time to the 101 counts as request time.
- `upgrade.test.ts` routes an upgrade the way `@fastify/websocket` does: status 101, a stream, not aborted,
  first byte under 100 ms on a 300 ms session. It fails without the fix.
- Rows stored before the fix keep their old label.
