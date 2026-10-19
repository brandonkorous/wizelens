import { patchMethod } from "../adapters/registry.js";
import { instrumentMysql2 } from "../adapters/mysql2.js";
import { instrumentPg } from "../adapters/pg.js";
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
  ["mysql2", () => {
    onLoad(nm("mysql2/lib/connection.js"), (Connection) => void instrumentMysql2(autoHandle, { Connection }));
    onLoad(nm("mysql2/lib/pool.js"), (Connection) => void instrumentMysql2(autoHandle, { Connection }));
  }],
  ["sqlite", hookSqlite],
  ["prisma", hookPrisma],
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

const LOGGERS: [string, () => void][] = [
  ["pino", () => onLoad(nm("pino/pino.js"), (pino) => wrapFactory(pino, (logger) => instrumentPino(autoHandle, logger)))],
  ["winston", () => onLoad(nm("winston/lib/winston.js"), (w) => patchFactory(w, "createLogger", (logger) => instrumentWinston(autoHandle, logger)))],
  ["bunyan", () => onLoad(nm("bunyan/lib/bunyan.js"), (b) => patchFactory(b, "createLogger", (logger) => instrumentBunyan(autoHandle, logger)))],
];

/** Hook every database, queue, RPC, and logging library the add-on supports, except the ones in WIZELENS_AUTO_SKIP. */
export function hookLibraries(): void {
  for (const [name, hook] of [...DATABASES, ...MESSAGING, ...LOGGERS]) if (!skipped(name)) hook();
}
