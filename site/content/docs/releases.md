---
title: Releases
description: Send your app's version, and every chart marks each release, the service page compares versions, and lists show what is new in one.
---

Every WizeLens SDK sends the version of your app as `service.version` on its spans. With it, every chart marks when a
release went out, the service page compares versions side by side, and Errors, Insights, and Security show what a release
brought. Problems names a new release as a suspected cause.

## Send the version

| Stack | Where the version comes from |
|---|---|
| Node, Next.js | The `release` option, else `WIZELENS_RELEASE`, else `OTEL_SERVICE_VERSION`, else `npm_package_version` (set when npm runs your script) |
| .NET | The `Release` option, else `WIZELENS_RELEASE`, else `OTEL_SERVICE_VERSION`, else the entry assembly's informational version |
| React | The `release` prop of `WizeLensProvider`, else what the build plugin set |
| Vue, Angular, Svelte, plain JS | The `release` option, else what the build plugin set |
| Java, Python, Go | `service.version` on the OpenTelemetry resource, for example `OTEL_RESOURCE_ATTRIBUTES=service.version=1.4.2` |

```ts
createWizeLens({ release: process.env.GIT_SHA });
```

The build plugins of `@wizeworks/lens-cli` (Vite, webpack, and Next.js) set the release for browser code, and upload
source maps under the same release, so browser stacks find the right maps. See [Source maps](/docs/source-maps/).

A version is kept up to 50 characters. Any text works: `1.4.2`, `2026.10.21`, or a commit hash.

## Markers on charts

Every time chart draws a dashed line, with the version, at the moment a release first sent data. Releases less than one
bar apart share one line, so services that ship together draw one marker ("3 releases"). With more than six lines, the
labels hide and the lines stay. Hover a bar to see the releases in it, with their service and version.

When you pick a service in the top bar, charts mark that service's releases only.

## Compare versions

A service's page has a **Versions** panel with its 10 newest versions:

| Column | What it shows |
|---|---|
| Version | The version, with **Latest** on the newest |
| Released | When it first sent data, over everything the host keeps |
| Requests | Requests in the time range |
| Error Rate | Red when it fails more often than the version before it |
| p95 | p95 duration |
| New Errors | Error groups first seen while this version was the newest |

Click a version to open the Errors page with the groups it brought.

## New in this release

Errors, Insights, and Security have a **Release** filter once you pick a service. **New in 1.4.2** keeps what was first
seen while 1.4.2 was the newest version of that service: from its first data until the next version came out.

## Problems

[Problems](/docs/problems/) reads the same release facts. When a service runs above normal right after a new version went
out, the problem names the release as its suspected cause. In the cloud, an "above normal" [alert](/docs/alerts/) notice
links to that problem.
