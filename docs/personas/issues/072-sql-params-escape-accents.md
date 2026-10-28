# 072 — .NET and Python SQL params show "Peña —" as "Peña —"

**Status:** fixed
**Severity:** major
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 11
**Surface:** Trace detail › SQL (in-app and cloud, shared links too)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 11 · Trace detail › SQL
**Blocked on:** —

## What happened

The contractor's shared link of the admin save showed the UPDATE's params with
`"@p3":"Peña Ridge 2-Person Tent — 3-season, 1.9 kg"`. Sid typed "Peña Ridge 2-Person Tent — 3-season, 1.9 kg".

## What should have happened

The value reads as typed. Escaped text also cannot be found by searching "Peña".

## Where it lives

.NET `DbActivity.ParametersJson` used `JsonSerializer`'s default encoder, which escapes every non-ASCII letter (the
MongoDB add-on did the same for names). Python `params_json` used `json.dumps` with its default `ensure_ascii=True`.
Node (`JSON.stringify`) and Go (`marshal`, no HTML escaping) were right; Java writes OpenTelemetry's plain values.

## The fix

.NET: `WizeLensJson.Text` (relaxed encoder) for SQL params and Mongo command text. Python: `ensure_ascii=False`.
Tests: `ParametersTextTests` (.NET) and `test_params_keep_letters_as_typed` (Python).

## Confirmed by

2026-10-27 19:59, P03 saved product 1 in the admin (trace `2d67f137…`). SQL tab on https://localhost:5099/_wizelens and
in the cloud: `"@p3":"Peña Ridge 2-Person Tent — 3-season, 1.9 kg"`.
