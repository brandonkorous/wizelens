"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";

const GROUPS = [
  { title: "Frameworks", items: ["ASP.NET Core", "Express", "Fastify", "Koa", "Hono", "Next.js", "node:http", "React"] },
  { title: "Databases and ORMs", items: ["EF Core", "Dapper", "ADO.NET", "Npgsql", "SqlClient", "MySqlConnector", "Prisma", "Drizzle", "TypeORM", "pg", "mysql2", "better-sqlite3", "node:sqlite"] },
  { title: "Messaging and RPC", items: ["gRPC", "RabbitMQ", "Kafka", "Azure Service Bus", "MassTransit", "HttpClient", "fetch"] },
  { title: "Logging", items: ["ILogger", "Serilog", "NLog", "console", "pino", "winston", "bunyan", "log4js", "consola", "NestJS"] },
  { title: "Open standards", items: ["OpenTelemetry", "OTLP", "W3C traceparent", "MCP"] },
];

const ALL = GROUPS.flatMap((g) => g.items);

function Chip({ name, seen }: { name: string; seen: boolean }) {
  const order = ALL.indexOf(name);
  return (
    <li className="wl-chip">
      <motion.span
        className="wl-chip-dot"
        initial={{ backgroundColor: "#d3d8e0" }}
        animate={seen ? { backgroundColor: "#22c55e" } : {}}
        transition={{ delay: 0.25 + order * 0.035, duration: 0.25 }}
      />
      {name}
    </li>
  );
}

// Everything WizeLens traces today; each one checks in as the section comes into view.
export function Stack() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { amount: 0.25, once: true });
  return (
    <section className="wl-section wl-paper">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">Works with what you already run.</h2>
          <p className="wl-lede">
            .NET 10, Node 22, and React 18 or newer. Anything else that speaks OpenTelemetry can send to the hub.
          </p>
        </div>
        <div className="wl-stack" ref={ref}>
          {GROUPS.map((g) => (
            <div key={g.title} className="wl-stack-group">
              <h3>{g.title}</h3>
              <ul>{g.items.map((i) => <Chip key={i} name={i} seen={seen} />)}</ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
