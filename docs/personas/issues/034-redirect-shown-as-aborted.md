# 034 — Requests said the visitor gave up, but kanNINJA had sent them to sign in

**Status:** fixed
**Severity:** minor
**Found by:** P02 · kanNINJA ops · act 7
**Surface:** Cloud › Requests (list, side panel) and Cloud › Traces › one trace
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 7 — kanNINJA refreshed with the fixed agent, database stopped again, Dani opened the board 3 times: Requests › Failed lists the three new `GET /dojo/c2be23b0-…` rows as **307** (2:42:46, 2:42:56, 2:43:04 AM PDT), the same status the trace page shows; the four from before the fix still say Aborted. `node` tests 289 pass
**Blocked on:** —

## What Greta saw

With kanNINJA's database down, her error-rate rule fired. "View the traces" listed four
`GET /dojo/c2be23b0-…` rows with the status **Aborted**, and the side panel said "Aborted by the client".
The full trace of the same request said **307**: kanNINJA had answered, sending Dani to sign in because
the session check failed (`connect ECONNREFUSED 127.0.0.1:5433`). Two screens gave the same request two
different outcomes, and "the client gave up" points her at the network instead of at her database.

## Where it lives

`js/packages/node/src/request-capture.ts` `finishSpan` marked a request aborted whenever the connection
closed before the body finished, even after the status was sent. Next.js sends a redirect's status at
once and streams the rest; the browser follows the redirect and closes the first answer. The comment
above the line already said aborted means "no status was ever sent". The .NET agent does not set the flag.

## Fix

- `finishSpan`: aborted only when no status was sent (`!res.headersSent`).
- `capture.test.ts`: a `307` sent, then the client leaves → status 307, not aborted.
- Traces captured before the fix keep their old label.
