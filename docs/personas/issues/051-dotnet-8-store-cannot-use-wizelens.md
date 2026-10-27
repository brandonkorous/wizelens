# 051 — My store is on .NET 8 and cannot move, so WizeLens is out before I start

**Status:** fixed
**Severity:** major
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 1
**Surface:** Site › .NET (`/dotnet/`), and the WizeLens.AspNetCore package
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · acts 1–3 · site /dotnet/, eShop on .NET 8
**Blocked on:** — (decided 2026-10-27: option A)

## What happened

From the home page Sid clicked ".NET". The first paragraph of `/dotnet/` ends:
"Requires .NET 10 or newer." The home page also shows ".NET 10". eShopOnWeb, the
store he runs, targets `net8.0` (`Directory.Packages.props`), and he cannot move it:
the payment terminal's library is not ready for anything newer. The page offers no
other path for .NET 8 or 9. Sid stops here.

The copy is true, so this is not a copy defect: the product does not support the
LTS version most ASP.NET Core shops still run.

## What should have happened

Sid expected a tool for ASP.NET Core to install on the LTS release his store runs.
.NET 8 is supported by Microsoft until 2026-11-10; many shops run it past that.

## How to reproduce

1. http://localhost:5190/ → ".NET" → read the first paragraph.
2. In eShopOnWeb (`net8.0`): `dotnet add package WizeLens.AspNetCore` → NuGet NU1202
   (the package has only `net10.0`). Not run as Sid: the site told him first.

## Why it matters

A .NET developer on 8 or 9 cannot finish any job. They leave at the first page.

## Where it lives

`dotnet/Directory.Build.props`: `<TargetFramework>net10.0</TargetFramework>` for every
package. A scratch build of WizeLens.AspNetCore for `net8.0` (copy in the scratchpad,
nothing in the repo changed) gave 2 errors, both CS0433 in
`Capture/WizeLensLoggerProvider.cs:7`: `ProviderAliasAttribute` in two versions of
Microsoft.Extensions.Logging.Abstractions (the framework's 8.0 and 10.x pulled in by
`Microsoft.Data.Sqlite 10.0.13` or `ModelContextProtocol.AspNetCore 2.2.0`). So the
code itself needs almost no change; the work is package versions, the add-on
packages, and running the tests on both.

## Options (Brandon's decision)

- **A. Multi-target `net8.0;net10.0`** for every package (9.0 runs the 8.0 build).
  Per-target package versions; CI tests on both. Sid can finish his run.
- **B. Keep .NET 10 only, and give 8 and 9 a path.** The page and docs say how a
  .NET 8 app can still send to the cloud or hub (OpenTelemetry OTLP), without the
  in-app dashboard or the HUD.
- **C. Keep .NET 10 only.** Sid's run records "left at act 1"; a P03 rerun would
  upgrade eShop first.

Recommend **A**: it costs little (2 compile errors), and Sid's shop is the common case.

## The fix

Brandon chose A (2026-10-27).

- `dotnet/Directory.Build.props`: `TargetFrameworks` `net8.0;net10.0`; `MsLibVersion` picks the 8.0.33 line of the
  Microsoft packages on .NET 8 (Data.Sqlite, EF Core Relational, and the test packages); on .NET 8,
  `System.Diagnostics.DiagnosticSource` 10.0.13 (it supports .NET 8) gives `Activity.AddException`.
- `WizeLens.AspNetCore.csproj`: on .NET 8, `Microsoft.Extensions.Logging` 10.0.13, because the MCP SDK already brings
  Logging.Abstractions 10 there (the CS0433 on `ProviderAlias`).
- `Hex.cs`: one helper for lower-case hex (`Convert.ToHexStringLower` is .NET 9+), used by the 3 callers.
- `Metrics/RuntimeMeter.cs`: on a .NET 8 runtime, the System.Runtime numbers .NET 9 has built in (working set, CPU
  time, GC collections, pause time, heap size, thread pool), under the same names; found by the one test that failed
  on .NET 8 (`MetricsAppTests.Serves_points_and_the_metrics_capability`). A .NET 9 app runs the .NET 8 build, so it
  checks the runtime version too.
- The gateway sample stays one framework (an app). The startup hook publishes `-f net10.0` (Dockerfile, release), and
  the auto-install docs say it is the .NET 10 build; on 8 or 9, add the package.
- CI and release install .NET 8 and 10; `dotnet test` runs both (513 pass on each, 6 skipped, locally).
- Copy: site `/dotnet/` (lede, stat, SEO title, startup-hook card), home stack line, FAQ, docs ASP.NET Core and
  quick start, README.

## Confirmed by

2026-10-27, P03 Sid: `/dotnet/` reads "Runs on .NET 8, 9 and 10"; the ASP.NET Core docs page says the same.
`dotnet add package WizeLens.AspNetCore --prerelease` in eShop `src/Web` and `src/PublicApi` (both `net8.0`, from
a local feed of this branch's packages) restored with no error; `WizeLens.EntityFrameworkCore` in
`src/Infrastructure` too. eShop built with 0 errors, ran, and `https://localhost:5001/_wizelens/` showed the store
home request with its 4 SQL queries against SQL Server, and the HUD on the Razor page.
