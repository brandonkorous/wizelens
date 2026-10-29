# 203 — Page faults show as "418,452,848,767%"

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, scoring pass (cloud metrics list over AI read access, `k8s.node.memory.page_faults`)
**Surface:** Metrics list and charts, alerts, the MCP metric tools
**Filed:** 2026-10-29
**Fixed:** 2026-10-29 (PR #124)
**Confirmed by:** core test "shows a plain count in unit 1 as a number and a named share as percent"; not yet re-seen on screen

## What happened

OpenTelemetry's unit `1` means any plain number. WizeLens showed every `1` as a percent, so counts such as page
faults read as huge percents.

## Where it lives

`js/packages/core/src/metrics/series.ts`, `displayUnitOf`, which picks the shown unit and knew only the unit.

## Fix

`displayUnitOf` takes the metric name. Unit `1` stays a percent only for names with utilization, ratio, fraction or
percent.

## Confirmation

- Core test: `k8s.pod.memory.page_faults` at 4,184,528 shows "4,184,528"; `process.cpu.utilization` at 0.25 shows "25.0%".
- Still to do: re-see it on the Metrics page.
