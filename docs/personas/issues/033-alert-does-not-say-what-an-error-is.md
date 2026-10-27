# 033 — My error alert did not fire, and nothing told me a 400 does not count

**Status:** fixed
**Severity:** minor
**Found by:** P02 · kanNINJA ops · act 7
**Surface:** Cloud › Alerts › New alert
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 7 — New alert, Metric "Error rate (%)": the form now reads "Counts requests that recorded an error, or answered 500 or more. A plain 4xx is the caller's mistake and does not count."; "Slow queries" reads "Counts queries at or over the slow limit shown on Database." (Cloud › Alerts › New alert, desktop and 360px)
**Blocked on:** —

## What Greta saw

She made `API error rate > 2% (5 min) — page Greta` on `kanninja-backend`, then had Dani paste the
5,000-character email into a list name. kanNINJA refused it (`PATCH …/lists/… 400`), the browser threw
"Validation failed", and Errors listed one `ApiClientError` on Web App. Two alert checks later the rule
still said OK. She could not tell whether the rule was broken or the error did not count.

## Where it lives

The rule is right: an error-rate alert counts a request as failed when it recorded an error or answered
500 or more (`core/src/stats/requests.ts` `isFailed`), and a plain 400 is the caller's mistake. The
browser's error is on the Web App service, not `kanninja-backend`. But the New alert form says only
"Error rate (%)", so the rule's meaning is a guess. "Slow queries" has the same gap: the form does not
say which limit makes a query slow.

## Fix

- `ui/src/pages/alerts/alertTypes.ts` `METRIC_HINTS`: one line per metric that counts less than its name
  suggests (error rate, slow queries), shown under Metric in `AlertForm`, in the same style as the
  "above normal" note.
