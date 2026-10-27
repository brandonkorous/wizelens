export type Faq = { q: string; a: string };

// Plain answers to the questions people ask first. The same text feeds the page and its structured data.
export const FAQS: Faq[] = [
  {
    q: "What is WizeLens?",
    a: "WizeLens shows you everything one request did. You add a small package to your app, and every request becomes one trace: the click in the browser, every service it touched, every SQL query, every log line, and the render. In .NET and Node, a dashboard at /_wizelens shows it, and a small HUD in the corner of your page shows the latest request as you work, on pages your server renders and in React, Vue, Angular, and Svelte. Java, Python, and Go services send to the hub or the cloud.",
  },
  {
    q: "Is WizeLens free?",
    a: "Yes. The add-ons, the local hub, and the cloud service are open source under the MIT License. You can use them in any project, including paid ones, and run them yourself for free. The hosted WizeLens Cloud has a Free plan and paid plans for more data and history.",
  },
  {
    q: "Is WizeLens a replacement for Glimpse?",
    a: "In spirit, yes. Glimpse showed what one ASP.NET request did, in a HUD on the page. WizeLens does that for ASP.NET Core, Node, Java, Python, and Go, and for React, Next.js, Vue, Angular, and Svelte in the browser, and it follows the request through every service, built on OpenTelemetry. Its HUD sits on the pages your .NET or Node app renders, with no code. WizeLens is an independent project and is not affiliated with Glimpse.",
  },
  {
    q: "How is WizeLens different from an APM or observability platform?",
    a: "WizeLens starts at the developer's desk: two lines of setup, no account, no agent, and no collector. It points at the problem, such as an N+1 query, instead of only showing data. The same dashboard then runs on the hub or WizeLens Cloud for production, with alerts, uptime checks, SLOs, problems, and hosts and Kubernetes.",
  },
  {
    q: "Does WizeLens send my data anywhere?",
    a: "Only where you send it: your app, your own hub, your own cloud, or WizeLens Cloud if you pick it. The software sends no telemetry to WizeWorks. To check for known-vulnerable packages, the hub and the cloud send package names and versions (nothing else) to OSV. Start them with --no-osv, or set WIZELENS_PACKAGES=false in a service, to turn that off. Passwords, tokens, cookies, and keys are redacted before anything is stored.",
  },
  {
    q: "Can I run WizeLens in production?",
    a: "Yes. The .NET and Node add-ons are on in development and off in production unless you turn them on. In production they are send-only: they send traces to your hub or cloud, and the app serves no dashboard or read API. Sampling keeps a share of the traces plus every trace with an error or a slow span. A 4xx answer is not a failure. A 5xx your app sends on purpose, such as a 503 while a site is paused, stays out of error rates and alerts when it carries the X-WizeLens-Expected: 1 header. Platform teams can turn it on with no code change, with a variable, a startup hook, or a Kubernetes pod label.",
  },
  {
    q: "Does WizeLens use AI?",
    a: "There is no AI inside WizeLens. It has a read-only MCP endpoint that your own AI agent, such as Claude, can use to read traces, slow queries, N+1 problems, errors, problems, security risks, and a health report. On an add-on or the hub it is off until you turn it on. For WizeLens Cloud, add mcp.wizelens.com to Claude and sign in; it reads only the projects you pick. Secrets are redacted, and every call is logged.",
  },
  {
    q: "What does WizeLens work with?",
    a: "ASP.NET Core on .NET 8, 9, or 10, Node 22.13 or newer (Express, Fastify, Koa, Hono, NestJS, Next.js), and React 18 or newer, Vue, Angular, Svelte, or any page in the browser. Java (Spring and more, through the OpenTelemetry agent), Python (FastAPI, Flask, Django), and Go (net/http) through OpenTelemetry. Databases through EF Core, Dapper, ADO.NET, Prisma, Drizzle, TypeORM, pg, mysql2, SQLite, Redis, MongoDB, Elasticsearch, JDBC, SQLAlchemy, and database/sql. gRPC, RabbitMQ, Kafka, Azure Service Bus, BullMQ, and Amazon SQS. Any other language can send OpenTelemetry to the hub.",
  },
];
