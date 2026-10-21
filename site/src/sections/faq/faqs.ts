export type Faq = { q: string; a: string };

// Plain answers to the questions people ask first. The same text feeds the page and its structured data.
export const FAQS: Faq[] = [
  {
    q: "What is WizeLens?",
    a: "WizeLens shows you everything one request did. You add a small package to your app, and every request becomes one trace: the click in the browser, every service it touched, every SQL query, every log line, and the render. In .NET and Node, a dashboard at /_wizelens shows it, and in React a small HUD in the corner of your page shows the latest request as you work. Java, Python, and Go services send to the hub or the cloud.",
  },
  {
    q: "Is WizeLens free?",
    a: "Yes. The add-ons, the local hub, and the cloud service are open source under the MIT License. You can use them in any project, including paid ones, and run them yourself for free. The hosted WizeLens Cloud has a Free plan and paid plans for more data and history.",
  },
  {
    q: "Is WizeLens a replacement for Glimpse?",
    a: "In spirit, yes. Glimpse showed what one ASP.NET request did. WizeLens does that for ASP.NET Core on .NET 10, for Node, and for React and Next.js, and it follows the request through every service, built on OpenTelemetry. WizeLens is an independent project and is not affiliated with Glimpse.",
  },
  {
    q: "How is WizeLens different from an APM or observability platform?",
    a: "Observability platforms watch production fleets. WizeLens is made for the developer at the desk: two lines of setup, no account, no agent, and no collector. It points at the problem, such as an N+1 query, instead of only showing data. When a team needs history and alerts, the same dashboard runs in the local hub or WizeLens Cloud.",
  },
  {
    q: "Does WizeLens send my data anywhere?",
    a: "No. Traces stay in your app, your own hub, or your own cloud database. The software sends no telemetry to WizeWorks. Passwords, tokens, cookies, and keys are redacted before anything is stored.",
  },
  {
    q: "Can I run WizeLens in production?",
    a: "WizeLens is on in development and off in production unless you turn it on. If you do, it is send-only: it sends traces to your cloud or hub, and the app serves no dashboard or read API. Sampling keeps a share of the traces plus every trace with an error or a slow span. WizeLens is in alpha today.",
  },
  {
    q: "Does WizeLens use AI?",
    a: "There is no AI inside WizeLens. It has an optional, read-only MCP endpoint that your own AI agent, such as Claude, can use to read traces, slow queries, N+1 problems, errors, and a health report. In the cloud, Claude signs in and reads only the projects you pick. It is off by default, redacted, and every call is logged.",
  },
  {
    q: "What does WizeLens work with?",
    a: "ASP.NET Core on .NET 10, Node 22.13 or newer (Express, Fastify, Koa, Hono, NestJS, Next.js), and React 18 or newer, Vue, Angular, Svelte, or any page in the browser. Java (Spring and more, through the OpenTelemetry agent), Python (FastAPI, Flask, Django), and Go (net/http) through OpenTelemetry. Databases through EF Core, Dapper, ADO.NET, Prisma, Drizzle, TypeORM, pg, mysql2, SQLite, Redis, MongoDB, Elasticsearch, JDBC, SQLAlchemy, and database/sql. gRPC, RabbitMQ, Kafka, Azure Service Bus, BullMQ, and Amazon SQS. Any other language can send OpenTelemetry to the hub.",
  },
];
