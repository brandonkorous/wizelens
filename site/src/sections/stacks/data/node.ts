import type { Stack } from "../types";

export const NODE: Stack = {
  slug: "node",
  name: "Node",
  title: "WizeLens for Node",
  headline: ["Every Node request,", "one line at a time."],
  lede: "One middleware for Express, Fastify, Koa, Hono, or Next.js. One line per database, queue, and logger. Outgoing fetch is traced for free.",
  facts: [
    { value: "1 line", label: "per driver, queue, or logger" },
    { value: "5", label: "frameworks, plus node:http" },
    { value: "Node 22+", label: "24 is best" },
  ],
  file: "server.ts",
  code: [
    'const wizelens = createWizeLens({ serviceName: "orders-api" });',
    "instrumentPg(wizelens, pg);",
    "instrumentPino(wizelens, logger);",
    "instrumentAmqplib(wizelens, amqplib);",
    "",
    "const app = express();",
    "app.use(wizelens.middleware);",
  ],
  traceTitle: "POST /orders · 96 ms",
  scale: 100,
  rows: [
    { label: "POST /orders", ms: "96 ms", start: 0, dur: 96, kind: "server", depth: 0, line: 6 },
    { label: "INSERT INTO orders (customer_id, total) …", ms: "4.2 ms", start: 8, dur: 5, kind: "db", depth: 1, line: 1 },
    { label: "SELECT qty FROM stock WHERE sku = $1", ms: "1.1 ms", start: 16, dur: 2, kind: "db", depth: 1, line: 1 },
    { label: "info  order 1042 created", ms: "", start: 22, dur: 1, kind: "log", depth: 1, line: 2 },
    { label: "publish order.created", ms: "2.4 ms", start: 26, dur: 3, kind: "msg", depth: 1, line: 3 },
    { label: "fetch POST billing/invoices", ms: "58 ms", start: 32, dur: 58, kind: "net", depth: 1, line: 0 },
  ],
  captures: [
    { title: "Frameworks", items: ["Express", "Fastify", "Koa", "Hono", "Next.js", "node:http"] },
    { title: "Databases", items: ["pg", "mysql2", "better-sqlite3", "node:sqlite", "Prisma", "TypeORM", "Drizzle", "traceDb() for any driver"] },
    { title: "Calls out", items: ["fetch and undici, automatic", "@grpc/grpc-js"] },
    { title: "Messages", items: ["amqplib (RabbitMQ)", "kafkajs", "@azure/service-bus"] },
    { title: "Logs", items: ["console, automatic", "pino", "winston", "bunyan", "log4js", "consola", "NestJS", "OpenTelemetry logs"] },
    { title: "Metrics", items: ["CPU and memory", "V8 heap", "Event loop delay", "GC pauses", "Your OpenTelemetry metrics"] },
  ],
  highlightsTitle: "Small on purpose.",
  highlights: [
    { title: "One line per library.", body: "No agent and no require hooks to set up. You tell WizeLens about the driver you use, and every query on it is traced.", code: "instrumentPg(wizelens, pg)" },
    { title: "No query is counted twice.", body: "Prisma on pg, or Drizzle on better-sqlite3? The ORM and the driver under it never record the same query twice." },
    { title: "Your logs stay where they were.", body: "WizeLens copies each line into its trace. Your logger still writes to the console, a file, or wherever it wrote before." },
    { title: "Off in production.", body: "On unless NODE_ENV is production. Turn it on there yourself, and add sampling for busy services." },
  ],
  docs: [
    { label: "Node setup", href: "/docs/node/" },
    { label: "Next.js setup", href: "/docs/nextjs/" },
    { label: "All Node options", href: "/docs/configuration/#node" },
  ],
};
