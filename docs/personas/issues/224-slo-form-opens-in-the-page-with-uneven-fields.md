# 224 — The SLO form opens in the middle of the page, and its fields do not line up

**Status:** fixed
**Severity:** design
**Found by:** Brandon · review of the SLOs page
**Surface:** Cloud › SLOs › New SLO, and Edit on one SLO's page
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** as Marisol, New SLO opened a window with Project first; typed loan-desk-api, "Préstamo approvals succeed" and `POST /api/loans/{id}/approve` by keyboard (Tab moved field to field), set 99.5 (the line under Target changed to "about 3.6 h of full outage in 30 days"), Enter saved it, the window closed and the SLO was in the list. Edit on its page opened the same window, filled in, in dark; Escape closed it. At 360 the fields are one column with no sideways scroll. Every gap between rows measured 18 px in New SLO, New alert and New check, where it was 14 to 36 px.
**Blocked on:** —

## What happened

New SLO pushed a form into the page above the list. The Project picker sat outside it, full width, with its hint
under it. The fields were in rows of three, and with "Requests are fast enough" the second row had four, so no field
lined up with the one above it. Alerts and Uptime open their forms in a window over the page; SLOs did not.

## What should have happened

New SLO and Edit open a window over the page, like a new alert. The Project picker is the first field in it. Every
field lines up in two even columns, and the buttons sit at the bottom right.

## Where it lives

`ui/src/pages/slos/SloForm.tsx`: a `Panel`, rows of three or four fields, and buttons in a `FormRow`.
`ui/src/pages/slos/SlosPage.tsx`: the Project picker drawn above the form, outside it.

## The fix

`SloForm.tsx` is a `Modal` with two even columns (`FormRow half`): Project; Service and Name; Endpoint on its own with
a hint; Good means and Within; Target and Window. Under Target, a line says what the target allows in time. The buttons
sit at the bottom right. `SlosPage.tsx` passes the Project picker in as the form's first field.
`layout.css`: inside a window, the form's gap alone spaces rows, hints, and notes (18 px), so New alert and New check
line up the same way.
