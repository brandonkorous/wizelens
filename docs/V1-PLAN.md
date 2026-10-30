# WizeLens — the road to 1.0

Decided 2026-10-29. After 1.0, renaming a setting, an env var, an export or a wire field breaks people's apps, so every
name that freezes is fixed first. Three sweeps read the npm packages, the .NET packages, and the wire contract with
the hub and cloud config. Then `1.0.0-rc.1` runs in the 12 production apps for about a week, and becomes `1.0.0`.

The npm packages, the .NET packages, the hub, the cloud, the inject image and both Helm charts go to 1.0. Python,
Java and Go stay 0.x and are called "preview". They follow every rename here, so all SDKs read the same env vars.

## Decisions

- **New names only.** Old names are removed, not kept as aliases. The CHANGELOG has a table of every rename.
- **One send-to name:** `endpoint` and `token` in code, `WIZELENS_ENDPOINT` and `WIZELENS_TOKEN` in env, and the same
  words in both Helm charts and the CLI. "Hub" was wrong when the target is the cloud.
- **The repository and every package move to `github.com/wizeworksllc`.** Images go to `ghcr.io/wizeworksllc/*`,
  charts to `oci://ghcr.io/wizeworksllc/charts`, and the Go module to `github.com/wizeworksllc/wizelens/go`.
- **Kept on purpose:** `PORT` and `DATABASE_URL` on the cloud (the usual names a platform sets); the snake_case alert
  metrics (`error_rate`, `p95_ms`), because saved rules store them; `wizelens.dev/*` Kubernetes labels (we own the
  domain); `WizeLens.*` namespaces in .NET, except the Serilog sink, which lives in `Serilog` like every sink.

## Status

| Phase | What | State |
|---|---|---|
| 1 | Move to wizeworksllc; npm pre-releases publish under `next` | done |
| 2 | A wire version, one error shape, and CONTRACT.md matches the code | done |
| 3 | One send-to name: `endpoint` and `token` | |
| 4 | Renames | |
| 5 | Hide what is not public | |
| 6 | The same behavior in every SDK | |
| 7 | Docs, wording, and the rename table | |
| 8 | `1.0.0-rc.1` | |
| 9 | `1.0.0`, after a week with no breaks | |

## 1. Move to wizeworksllc

- Every `brandonkorous` path (122 places): workflows, Dockerfiles, charts, compose, the prod overlay, package.json
  `repository`, `Directory.Build.props`, `pom.xml`, `pyproject.toml`, `go.mod` and its imports, READMEs, site links.
- `release.yml`: a version with a pre-release part publishes to npm with `--tag next`, so a later `1.1.0-rc.1` never
  becomes `latest`.

By hand, by Brandon, before this merges (the order matters; deploys break between steps 1 and 2):

1. Transfer `brandonkorous/wizelens` to `wizeworksllc` (Settings, Danger zone, Transfer). Secrets, variables and
   environments move with it, and GitHub redirects the old URL.
2. sparx.works Terraform, through its release: the Azure federated credential subject becomes
   `repo:wizeworksllc/wizelens:…`, and any prod image path there becomes `ghcr.io/wizeworksllc/…`.
3. npmjs.com, each of the 11 packages: trusted publisher owner `wizeworksllc`.
4. nuget.org: the trusted publishing policy points at `wizeworksllc/wizelens`.
5. PyPI: the pending publisher owner becomes `wizeworksllc`.
6. After the first push to ghcr.io/wizeworksllc: make `wizelens-hub`, `wizelens-cloud`, `wizelens-inject`,
   `wizelens-site` and the charts public, if they are not.

## 2. A wire version

- `api/info` answers `protocol: 1` (`PROTOCOL_VERSION` in lens-core); no `protocol` means 1. The version lives in the
  path, not a header: a browser header would cost every page a CORS preflight.
- CONTRACT.md writes the rules down: receivers ignore fields and capabilities they do not know; a breaking change is
  protocol 2 at `api/v2/…`; errors are `{ error, code? }`.
- CONTRACT.md matches the code: the `Capability` list (with `settings` and `packages`), the full `IngestBatch`
  (`metrics`, `sender.release`, `sender.k8s`), `storage.kind` with `postgres`, `api/packages` in both endpoint tables,
  the 10,000-character log limit and the 5,000-item batch limit, `WIZELENS_STATIC_FILES`, and no "(v0.x)" headings.

## 3. One send-to name

| Where | Old | New |
|---|---|---|
| Node, .NET, Python, Java, Go options | `hub`, `hubToken` / `HubUrl`, `HubToken` | `endpoint`, `token` / `Endpoint`, `Token` |
| Env, every SDK and the CLI | `WIZELENS_HUB`, `WIZELENS_HUB_TOKEN`, `WIZELENS_URL` | `WIZELENS_ENDPOINT`, `WIZELENS_TOKEN` |
| CLI flag | `--url` | `--endpoint` |
| Inject chart | `hub`, `hubTokenSecret` | `endpoint`, `existingSecret{name, key: token}` |
| Collector chart | `ingestKey`, `existingSecret.key: ingest-key` | `token`, `existingSecret.key: token` |
| Annotation | `wizelens.dev/hub` | `wizelens.dev/endpoint` |

The hub's own `WIZELENS_HUB_*` server settings keep their names: they configure the hub, not a sender.

## 4. Renames

npm:
- `serviceName` becomes `service` (the wire and the browser already say `service`).
- `wizelensFastify`, `wizelensKoa`, `wizelensHono`, `wizelensLogProcessor`, `wizelensMetricExporter` and
  `wizelensSourceMaps` become `wizeLens…`.
- `enableMcp` becomes `mcp`; `logs.sampleRate` becomes `logs.rate`; the hub's `logMaxAgeMs` becomes `logsMaxAgeMs`.
- Vue: the plugin `WizeLens` becomes `WizeLensPlugin`, and `WIZELENS_KEY` becomes `wizeLensKey`.
- React: `useWizeLens()` returns the recorder, so it becomes `useWizeLensRecorder()`; `createRecorder`,
  `startBrowserCapture` and `CaptureOptions` become `createReactRecorder`, `startReactCapture` and
  `ReactCaptureOptions`; `hud` takes `"auto"` like the browser.
- `lens-cli/next` `withWizeLens` becomes `withWizeLensSourceMaps`; `nextWizeLens` becomes `currentWizeLens`.
- The browser's `version` option is removed (`release` does the same).
- The CLI's bin `lens-cli` becomes `wizelens`.

.NET:
- `WizeLensOptions.ServiceName` becomes `Service`; `EnableMcp` becomes `Mcp`; `Logs.SampleRate` becomes `Logs.Rate`.
- `WizeLensKafka` becomes `WizeLensKafkaExtensions`.

Hub and cloud:
- Cloud `--allow-private-webhooks` becomes `--allow-private-targets` (it also covers uptime checks).
- `WIZELENS_CLOUD_CHECK_PWNED` becomes `WIZELENS_CLOUD_CHECK_PWNED_PASSWORDS`, like its flag.
- Cloud `--retention-days 30` becomes `--retention 30d`, like the hub.
- Wire: `sentAt` becomes `sentMs`; `oauth_query` becomes `oauthQuery`. (The OSV severity `warning` stays: every
  finding's severity is `info`, `warning` or `error`.)

## 5. Hide what is not public

- `@wizeworks/lens-core` exports the contract types, ids, traceparent and attribute names. Everything else moves to
  `@wizeworks/lens-core/internal`. `./kit` on node and hub becomes `./internal`. Every `internal` subpath says it is
  not covered by semver, and packages that use one depend on the exact same version.
- node, browser, react and cli indexes drop their helpers (`TraceStore`, `round1`, `fmtMs`, fiber hooks, `baseOf` …),
  and `export type *` from core goes. Test helpers leave the node tarball.
- .NET: about 85 types in `WizeLens.AspNetCore` become `internal` (`Model`, `Storage`, `Search`, `Analysis`,
  `Tagging`). `ProfiledDbCommand`'s constructor and `Adapter` setter, `WizeLensSampling.KeepByRate`,
  `WizeLensRequest.TagPrefix`, `WizeLensDbCommandInterceptor` and NLog's `ActivityContext` setter become internal.
- .NET adapters depend on the exact `WizeLens.AspNetCore` version, since they use its internals.

## 6. The same behavior in every SDK

- Every on/off env var goes through one parser (`true/1/on/yes`, `false/0/off/no`) and warns on anything else:
  `WIZELENS_HUB_MCP`, `_UPTIME`, `_OSV`, the cloud's `TRUST_PROXY`, `OSV`, `ALLOW_PRIVATE_TARGETS`, and
  `WIZELENS_PACKAGES` in .NET and Node.
- .NET reads `OTEL_SERVICE_NAME` in `AddWizeLens`, and the env vars it lacked: `WIZELENS_KEEP_ERRORS`,
  `WIZELENS_KEEP_SLOW_MS`, `WIZELENS_REDACT_KEYS`. Node reads the same three.
- `WizeLensOptions` reads every env default at registration, not when the object is made.

## 7. Docs and wording

- Every doc, sample and site page uses the new names. The CHANGELOG has the full rename table.
- .NET ships XML docs (`GenerateDocumentationFile`), with no links to repo-only plan files.
- The cloud's `copy-telemetry` command is in its usage text.

## 8. `1.0.0-rc.1`

`pnpm release:prep 1.0.0-rc.1`, merge, tag. The site pill says "Release candidate". Python, Java and Go say
"preview". Brandon moves the 12 production apps to `1.0.0-rc.1` with the new names.

## 9. `1.0.0`

After a week with no breaks: `pnpm release:prep 1.0.0`. No "alpha", "pre-release" or `--prerelease` in the README,
the docs or the site. .NET turns on package validation with 1.0.0 as the baseline, so a later break fails the build.
