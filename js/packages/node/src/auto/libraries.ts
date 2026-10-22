import { patchMethod } from "../adapters/registry.js";
import { instrumentElasticsearch } from "../adapters/elasticsearch.js";
import { instrumentIoRedis } from "../adapters/ioredis.js";
import { instrumentMongoDb } from "../adapters/mongodb.js";
import { instrumentMysql2 } from "../adapters/mysql2.js";
import { instrumentPg } from "../adapters/pg.js";
import { instrumentPostgresJs } from "../adapters/postgres.js";
import { instrumentRedis } from "../adapters/redis.js";
import { instrumentGraphql, traceGraphqlChannels, traceGraphqlFunction } from "../graphql/index.js";
import { instrumentGrpc } from "../grpc/index.js";
import { instrumentBunyan } from "../logs/bunyan.js";
import { instrumentPino } from "../logs/pino.js";
import { instrumentWinston } from "../logs/winston.js";
import { instrumentAmqplib } from "../messaging/amqplib.js";
import { instrumentBullMq } from "../messaging/bullmq.js";
import { instrumentKafkaJs } from "../messaging/kafkajs.js";
import { instrumentServiceBus } from "../messaging/servicebus.js";
import { instrumentSqs } from "../messaging/sqs.js";
import { skipped } from "./config.js";
import { esmPatch } from "./esm-source.js";
import { autoHandle } from "./handle.js";
import { onEsm, onEsmBinding, onLoad } from "./module-hooks.js";
import { hookPrisma } from "./prisma.js";
import { hookSqlite } from "./sqlite.js";

type Fn = (...args: unknown[]) => unknown;
const nm = (path: string) => new RegExp(`/node_modules/${path.replaceAll(".", "\\.")}$`);

/** A factory that returns a logger: hook each logger it makes. */
function wrapFactory(factory: unknown, hook: (made: unknown) => void): unknown {
  if (typeof factory !== "function") return undefined;
  const wrapped = function (this: unknown, ...args: unknown[]) {
    const made = (factory as Fn).apply(this, args);
    hook(made);
    return made;
  };
  return Object.assign(wrapped, factory, { default: wrapped, pino: wrapped });
}

/** Patch `name` on an object so each logger it makes is hooked. */
function patchFactory(target: unknown, name: string, hook: (made: unknown) => void): void {
  patchMethod(target as object, name, (original) =>
    function (this: unknown, ...args: unknown[]) {
      const made = original.apply(this, args);
      hook(made);
      return made;
    }, "auto-logger");
}

const DATABASES: [string, () => void][] = [
  ["pg", () => onLoad(nm("pg/lib/index.js"), (pg) => void instrumentPg(autoHandle, pg))],
  ["postgres", () => {
    onLoad(nm("postgres/cjs/src/query.js"), (mod) => void instrumentPostgresJs(autoHandle, mod));
    onEsm(esmPatch(nm("postgres/src/query.js"), "postgres-query", "Query"));
    onEsmBinding("postgres-query", (Query) => void instrumentPostgresJs(autoHandle, Query));
  }],
  ["mysql2", () => {
    onLoad(nm("mysql2/lib/connection.js"), (Connection) => void instrumentMysql2(autoHandle, { Connection }));
    onLoad(nm("mysql2/lib/pool.js"), (Connection) => void instrumentMysql2(autoHandle, { Connection }));
  }],
  ["sqlite", hookSqlite],
  ["prisma", hookPrisma],
  ["ioredis", () => onLoad(nm("ioredis/built/index.js"), (mod) => void instrumentIoRedis(autoHandle, mod))],
  ["redis", () => onLoad(nm("@redis/client/dist/lib/client/index.js"), (mod) => void instrumentRedis(autoHandle, mod))],
  ["mongodb", () => onLoad(nm("mongodb/lib/collection.js"), (mod) => void instrumentMongoDb(autoHandle, mod))],
  [
    "elasticsearch",
    () => {
      onLoad(nm("@elastic/transport/lib/Transport.js"), (mod) => void instrumentElasticsearch(autoHandle, mod));
      // The 9.x client imports the transport's ES module build in ES module apps.
      onEsm(esmPatch(nm("@elastic/transport/esm/Transport.js"), "elastic-transport", "Transport"));
      onEsmBinding("elastic-transport", (Transport) => void instrumentElasticsearch(autoHandle, Transport));
    },
  ],
];

/** BullMQ's ES build keeps each class in its own file. */
const BULLMQ_ESM = [["queue", "Queue"], ["worker", "Worker"], ["flow-producer", "FlowProducer"]] as const;

const MESSAGING: [string, () => void][] = [
  ["amqplib", () => onLoad(nm("amqplib/channel_api.js"), (mod) => void instrumentAmqplib(autoHandle, mod))],
  ["kafkajs", () => onLoad(nm("kafkajs/index.js"), (mod) => void instrumentKafkaJs(autoHandle, mod))],
  ["servicebus", () => {
    onLoad(nm("@azure/service-bus/dist/commonjs/index.js"), (mod) => void instrumentServiceBus(autoHandle, mod));
    onEsm(esmPatch(nm("@azure/service-bus/dist/esm/serviceBusClient.js"), "servicebus", "ServiceBusClient"));
    onEsmBinding("servicebus", (ServiceBusClient) => void instrumentServiceBus(autoHandle, { ServiceBusClient }));
  }],
  ["bullmq", () => {
    onLoad(nm("bullmq/dist/cjs/index.js"), (mod) => void instrumentBullMq(autoHandle, mod));
    for (const [file, binding] of BULLMQ_ESM) {
      onEsm(esmPatch(nm(`bullmq/dist/esm/classes/${file}.js`), `bullmq-${file}`, binding));
      onEsmBinding(`bullmq-${file}`, (value) => void instrumentBullMq(autoHandle, { [binding]: value }));
    }
  }],
  ["sqs", () => {
    onLoad(nm("@aws-sdk/client-sqs/dist-cjs/index.js"), (mod) => void instrumentSqs(autoHandle, mod));
    onEsm(esmPatch(nm("@aws-sdk/client-sqs/dist-es/SQSClient.js"), "sqs", "SQSClient"));
    onEsmBinding("sqs", (SQSClient) => void instrumentSqs(autoHandle, { SQSClient }));
  }],
  ["grpc", () => onLoad(nm("@grpc/grpc-js/build/src/index.js"), (grpc) => void instrumentGrpc(autoHandle, grpc))],
];

// The CommonJS file, the ES module file, and the function that runs operations: graphql-js, and GraphQL Yoga's executor.
const GRAPHQL_FILES: [string, string, string][] = [
  ["graphql/execution/execute.js", "graphql/execution/execute.mjs", "execute"],
  ["graphql/subscription/subscribe.js", "graphql/subscription/subscribe.mjs", "subscribe"],
  ["@graphql-tools/executor/cjs/execution/normalizedExecutor.js", "@graphql-tools/executor/esm/execution/normalizedExecutor.js", "normalizedExecutor"],
];

/** GraphQL: 17 and later through their tracing channels; older CommonJS builds are patched on load, ES module builds hand over the function. */
function hookGraphql(): void {
  traceGraphqlChannels(autoHandle);
  onLoad(nm("graphql/diagnostics.js"), () => void traceGraphqlChannels(autoHandle));
  for (const [cjs, esm, binding] of GRAPHQL_FILES) {
    const id = `graphql-${binding}`;
    onLoad(nm(cjs), (mod) => void instrumentGraphql(autoHandle, mod));
    onEsm(esmPatch(nm(esm), id, binding, true));
    onEsmBinding(id, (fn) => traceGraphqlFunction(autoHandle, fn));
  }
}

const APIS: [string, () => void][] = [["graphql", hookGraphql]];

const LOGGERS: [string, () => void][] = [
  ["pino", () => onLoad(nm("pino/pino.js"), (pino) => wrapFactory(pino, (logger) => instrumentPino(autoHandle, logger)))],
  ["winston", () => onLoad(nm("winston/lib/winston.js"), (w) => patchFactory(w, "createLogger", (logger) => instrumentWinston(autoHandle, logger)))],
  ["bunyan", () => onLoad(nm("bunyan/lib/bunyan.js"), (b) => patchFactory(b, "createLogger", (logger) => instrumentBunyan(autoHandle, logger)))],
];

/** Hook every database, queue, RPC, GraphQL, and logging library the add-on supports, except the ones in WIZELENS_AUTO_SKIP. */
export function hookLibraries(): void {
  for (const [name, hook] of [...DATABASES, ...MESSAGING, ...APIS, ...LOGGERS]) if (!skipped(name)) hook();
}
