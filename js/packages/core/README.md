# @wizeworks/lens-core

Shared types, trace building, analysis, and dashboard statistics for [WizeLens](https://github.com/wizeworksllc/wizelens).

You normally do not install this package yourself. `@wizeworks/lens-node`, `@wizeworks/lens-react`, and the dashboard use it.

What is inside:

- The wire contract types (`Span`, `Trace`, `ServiceInfo`, ...) and attribute names. See [docs/CONTRACT.md](https://github.com/wizeworksllc/wizelens/blob/main/docs/CONTRACT.md).
- `traceparent` helpers, trace merging, and clock-skew correction across services.
- Analysis: N+1 queries, N+1 HTTP calls, duplicate queries, slow queries, errors.
- Statistics for every dashboard page (requests, traces, database, rendering, errors, logs, services, insights).

MIT licensed.
