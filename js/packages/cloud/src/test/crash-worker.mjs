// Tests only: a settle worker that dies on its first task.
import { parentPort } from "node:worker_threads";

parentPort.on("message", () => process.exit(3));
