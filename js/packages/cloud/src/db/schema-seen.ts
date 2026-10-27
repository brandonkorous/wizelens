// Migration 29: the minutes each service sent anything (a batch or a heartbeat), so a chart tells "not sending" from "quiet".
import { orgPolicy } from "./schema-orgs.js";

export const SEEN_MIGRATION = `
CREATE TABLE service_minutes (
  project_id TEXT NOT NULL, service TEXT NOT NULL, environment TEXT NOT NULL, minute_ms DOUBLE PRECISION NOT NULL,
  org_id TEXT NOT NULL DEFAULT '', PRIMARY KEY (project_id, service, minute_ms, environment)
);
CREATE TRIGGER service_minutes_org BEFORE INSERT ON service_minutes FOR EACH ROW EXECUTE FUNCTION wl_org_of_project();
${orgPolicy("service_minutes")}`;
