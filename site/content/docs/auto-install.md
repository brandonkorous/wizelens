---
title: Install with no code change
description: Turn WizeLens on for Node and ASP.NET Core without touching their code, with a Node --import hook, a .NET startup hook, or a Kubernetes webhook.
---

Platform teams can turn WizeLens on for a service without a pull request to it. The app keeps its code; WizeLens comes in
when the process starts, and environment variables set it up. The [code install](/docs/node/) still works, and wins when
both are there.

## Node

```bash
NODE_OPTIONS="--import @wizeworks/lens-node/auto" node server.js
```

`@wizeworks/lens-node` must be where Node can find it: installed in the app (`npm install @wizeworks/lens-node`, no code),
or anywhere on disk with a path, for example `--import /opt/wizelens/node/dist/auto.js`. Node 22.13 or newer.

It hooks everything the add-on supports, as the app loads it:

| What | Hooked |
|---|---|
| Requests | Every `node:http` and `node:https` server, so every framework. Routes are named for Express, Fastify, Koa (`@koa/router`), Hono (`@hono/node-server`), Next.js, and NestJS |
| Errors | Express (`next(err)` and unhandled), Fastify, Koa, and Hono errors go on the request span |
| Databases | `pg`, `mysql2`, `better-sqlite3`, `node:sqlite`, Prisma Client (`@prisma/client`), ioredis, node-redis, MongoDB, and Elasticsearch. TypeORM and Drizzle through their driver |
| Outgoing calls | `fetch`, undici, and `node:http` / `node:https` (axios, got, the AWS SDK) |
| gRPC and messaging | `@grpc/grpc-js`, `amqplib`, `kafkajs`, `@azure/service-bus`, BullMQ, and Amazon SQS |
| GraphQL | graphql-js and GraphQL Yoga |
| Logs | `console`, pino (also Fastify's logger), winston, and bunyan |
| Metrics | CPU, memory, heap, event loop, and GC |

Nothing starts until the process serves a request or starts a server, so `npm`, build tools, and scripts that inherit
`NODE_OPTIONS` stay untouched. Worker threads are skipped. On Node 22.13 and 22.14, the hooks that edit ES modules are
off: Hono's ES build, the ES builds of `@azure/service-bus`, the Elasticsearch 9 transport, BullMQ, and the SQS client,
graphql 16's ES build, and `import "node:sqlite"`. Node 22.15 and newer have them.

## ASP.NET Core

```bash
DOTNET_STARTUP_HOOKS=/opt/wizelens/dotnet/WizeLens.AutoInstrumentation.dll dotnet MyApp.dll
```

The hook is a folder: `WizeLens.AutoInstrumentation.dll` with its dependencies next to it. Get it from the
`wizelens-dotnet-auto-<version>.zip` file on each GitHub release, from `/wizelens/dotnet` in the
`ghcr.io/brandonkorous/wizelens-inject` image, or build it with
`dotnet publish dotnet/src/WizeLens.AutoInstrumentation -c Release -o /opt/wizelens/dotnet`.

If the app references the `WizeLens.AutoInstrumentation` NuGet package (still no code), one variable is enough:
`ASPNETCORE_HOSTINGSTARTUPASSEMBLIES=WizeLens.AutoInstrumentation`.

It does what `AddWizeLens()` and `UseWizeLens()` do: requests, routes, outgoing HTTP and gRPC, Npgsql, MySqlConnector, and
SqlClient, every `ILogger` line, metrics, and the dashboard at `/_wizelens`. It also records EF Core commands with no
`UseWizeLens()` on the DbContext, and the exceptions that the exception page or `UseExceptionHandler` catch. It works with
`WebApplication` and the generic web host. `ASPNETCORE_PREVENTHOSTINGSTARTUP=true` turns it off.

## Settings

The same variables as the code install, plus the standard OpenTelemetry service name:

| Variable | What |
|---|---|
| `OTEL_SERVICE_NAME` | Service name. Node: else `service.name` in `OTEL_RESOURCE_ATTRIBUTES`, else the app's `package.json` name (no scope), else `node-app`. .NET: else the application name |
| `WIZELENS_ENABLED` | On or off. Default: on in development, off in production |
| `WIZELENS_DASHBOARD` | Serve `/_wizelens` in the app. Default: on in development, off in production (send-only) |
| `WIZELENS_HUB`, `WIZELENS_HUB_TOKEN` | Where to send, see [the hub](/docs/hub/) and [the cloud](/docs/cloud/) |
| `WIZELENS_PROJECT` | The project on a shared hub |
| `WIZELENS_SAMPLE_RATE` | Share of traces kept, see [Sampling](/docs/sampling/) |
| `WIZELENS_RELEASE` | The app's version on every span, for release markers and Problems |
| `WIZELENS_LOGS_OUTSIDE`, `WIZELENS_LOGS_MIN_LEVEL`, `WIZELENS_LOGS_SAMPLE_RATE` | Lines written outside a request, see [Logs](/docs/logs/) |
| `WIZELENS_PACKAGES` | `false` stops the package report for the known-vulnerability check |
| `WIZELENS_AUTO_SKIP` | Node: hooks to leave off, comma-separated, for example `prisma,pino` |

The names `WIZELENS_AUTO_SKIP` takes: `express`, `koa`, `fastify`, `hono`, `next`, `nest`, `pg`, `mysql2`, `sqlite`,
`prisma`, `ioredis`, `redis`, `mongodb`, `elasticsearch`, `amqplib`, `kafkajs`, `servicebus`, `bullmq`, `sqs`, `grpc`,
`graphql`, `pino`, `winston`, and `bunyan`. The full list of variables is on [Configuration](/docs/configuration/#environment-variables).

In production, set `WIZELENS_ENABLED=true` and a hub, like any service: see [Production](/docs/production/).

## Kubernetes

A mutating admission webhook adds the hook and the variables to every pod labeled `wizelens.dev/inject`. Install its
chart once:

```bash
helm install wizelens-inject oci://ghcr.io/brandonkorous/charts/wizelens-inject \
  --namespace wizelens --create-namespace \
  --set hub=http://wizelens-hub.wizelens:5960
```

Then label a pod template and restart it:

```yaml
spec:
  template:
    metadata:
      labels:
        wizelens.dev/inject: node   # or: dotnet
```

Each new pod gets a small first step that copies the WizeLens files into a shared folder at `/wizelens`, then
`NODE_OPTIONS` (Node) or `DOTNET_STARTUP_HOOKS` (.NET), joined to any value the container already sets, and the settings
above. A variable the container sets itself is kept. The pod's annotations change one pod:

| Annotation | What |
|---|---|
| `wizelens.dev/service` | Service name. Default: the `app.kubernetes.io/name` or `app` label, else the container name |
| `wizelens.dev/hub` | Hub for this pod |
| `wizelens.dev/project` | Project. Default: the chart's `project`, else the namespace |
| `wizelens.dev/dashboard` | `"true"` serves `/_wizelens` in the pod |
| `wizelens.dev/container-names` | Only these containers, for example `api,worker` |

Chart values: `hub`, `hubTokenSecret.name` and `.key` (a Secret in each app namespace, read as `WIZELENS_HUB_TOKEN`),
`project`, `dashboard`, `namespaceLabels` (limit to labeled namespaces), and `failurePolicy` (default `Ignore`: a webhook
that is down never blocks a deploy). Injected pods carry `wizelens.dev/injected`. The chart makes its own TLS certificate.

## When the app installs WizeLens too

The code install wins. Node: when the app calls `createWizeLens()`, the auto install stops its own instance and prints
`... installs WizeLens in code, so the auto install steps aside`. Libraries it already hooked send to the app's instance,
so nothing is counted twice. .NET: `AddWizeLens()` takes over the registration with its own options, and
`UseWizeLens()` adds the middleware once. Both need this version or newer on both sides.

## Try it

The samples have no WizeLens code. With a hub running (`pnpm dev:hub`):

```bash
cd samples/auto-node && WIZELENS_HUB=http://localhost:5960 pnpm start:auto
```

```bash
dotnet build dotnet/WizeLens.slnx -c Release
DOTNET_STARTUP_HOOKS=$PWD/dotnet/src/WizeLens.AutoInstrumentation/bin/Release/net10.0/WizeLens.AutoInstrumentation.dll \
  WIZELENS_HUB=http://localhost:5960 dotnet samples/auto-dotnet/bin/Release/net10.0/AutoDotnet.dll
```

Open `http://localhost:5960/_wizelens` and call `/api/products/1/related` on either: an N+1 shows up in its trace.
