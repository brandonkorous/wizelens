import type { Ctx } from "../app.js";
import { Router } from "../http/router.js";
import { alertRoutes } from "./alerts.js";
import { appRoutes } from "./apps.js";
import { changeRoutes } from "./changes.js";
import { issueRoutes } from "./issues.js";
import { meRoutes } from "./me.js";
import { mcpRoutes } from "./mcp.js";
import { shareRoutes } from "./shares.js";
import { dataRoutes } from "./data.js";
import { modelRoutes } from "./models.js";
import { notifyRoutes } from "./notify.js";
import { orgRoutes } from "./orgs.js";
import { projectRoutes } from "./projects.js";
import { searchRoutes } from "./search.js";
import { statusRoutes } from "./status.js";
import { uptimeRoutes } from "./uptime.js";
import { sourceMapRoutes } from "./sourcemaps.js";

/** Every route below `/_wizelens/`, except ingest and OTLP (they use ingest keys and are matched first). */
export function allRoutes(): Router<Ctx> {
  const r = new Router<Ctx>();
  meRoutes(r);
  notifyRoutes(r);
  orgRoutes(r);
  projectRoutes(r);
  dataRoutes(r);
  modelRoutes(r);
  changeRoutes(r);
  searchRoutes(r);
  alertRoutes(r);
  issueRoutes(r);
  shareRoutes(r);
  uptimeRoutes(r);
  statusRoutes(r);
  mcpRoutes(r);
  appRoutes(r);
  sourceMapRoutes(r);
  return r;
}
