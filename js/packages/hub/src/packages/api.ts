// `POST api/packages`: the packages a service runs, from an SDK at start (docs/CONTRACT.md "Packages").
import type { IncomingMessage, ServerResponse } from "node:http";
import { parsePackagesReport } from "@wizeworks/lens-core/internal";
import { sendJson } from "@wizeworks/lens-node/internal";
import { parseJson, readBody } from "../body.js";
import type { PackageDb } from "./store.js";

/** Store a report for the project it names (the hub) or the key's project (the cloud, which passes `project`). */
export async function receivePackages(db: PackageDb, req: IncomingMessage, res: ServerResponse, now: number, project?: string): Promise<void> {
  const r = parsePackagesReport(parseJson(await readBody(req)));
  if (typeof r === "string") return sendJson(res, 400, { error: r });
  await db.replace(project ?? r.sender.project ?? "", r.sender.service, r.packages, now);
  res.writeHead(204).end();
}
