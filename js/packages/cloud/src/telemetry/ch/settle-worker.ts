// A settle worker thread: settles the project tasks the main thread sends, on its own ClickHouse client.
import { parentPort, workerData } from "node:worker_threads";
import { chClient } from "./http.js";
import { type ProjectTask, settleProject } from "./settle-work.js";

interface Job {
  id: number;
  task: ProjectTask;
}

const port = parentPort!;
const ch = chClient({ url: (workerData as { url: string }).url });

port.on("message", (job: Job) => {
  settleProject(ch, job.task).then(
    () => port.postMessage({ id: job.id }),
    (err: unknown) => port.postMessage({ id: job.id, error: err instanceof Error ? err.message : String(err) }),
  );
});
