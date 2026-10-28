# 140 — Sending keys on a phone: an 888 px table on a 326 px screen, and two rows with one name during a rotate

**Status:** fixed
**Severity:** minor
**Found by:** P02 and P04 (rating gaps on Connect › Sending keys); worked in the 7-score pass with P05
**Surface:** Connect › Sending keys (also AI read keys)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol at 360 dark touch, 09:02; rule 7 P02 Greta 08:58

## What happened

- At 360 the keys table was 888 px wide inside 326 px: the Projects column was cut, names took five lines, and the
  dates and buttons were off to the right.
- During a rotate, the new and the old secret were two rows with the same name, told apart only by "In a day".

## Fix

- `ui/src/ui/Table.tsx`: a column can be `hideSm` (hidden at 640 px and below, header and cells).
- `ui/src/pages/connect/KeysPanel.tsx`: on a phone the key cell holds one line, "Ingest · Loan Desk API · used 10s ago ·
  ends Oct 29, 2026", and the other columns hide. Rotate rows carry "New secret" and "Old secret, stops Oct 29, 8:53:55 AM".
- `styles/pages/cloud.css`: on a phone, row buttons in a table stack, so the name gets the width.

## Confirmation

- 08:54, Marisol rotated a key: rows "… New secret …" and "… Old secret, stops Oct 29, 8:53:55 AM …".
- 09:02, Marisol at 360 dark touch: the table is 326 px in 326 px, no sideways scroll; each key is name, prefix, the
  one line, and Rotate over Revoke.
- Rule 7, 08:58, Greta's Members at 360 still shows Name and Role with the role picker.
