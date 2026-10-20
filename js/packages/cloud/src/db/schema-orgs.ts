// Migration 23: every telemetry row names its organization, so a read held to one organization never sees another's rows (docs/ALL-PROJECTS-PLAN.md).

/** Telemetry tables as of this migration. A fixed list: a later table adds its own `org_id`. */
export const ORG_TABLES = [
  "traces", "spans", "logs", "services", "metric_points", "metric_series", "metric_10s", "metric_5m", "metric_1h",
  "fact_requests", "fact_traces", "fact_logs", "fact_critical", "fact_search", "fact_attrs",
  "rollup_10s", "rollup_5m", "rollup_1h", "hist_10s", "hist_5m", "hist_1h",
] as const;

/** Writers name the project only: the trigger stamps its organization, or '' for a project that is gone (no org reads that). */
const STAMP = `
CREATE FUNCTION wl_org_of_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id = '' THEN NEW.org_id := COALESCE((SELECT org_id FROM projects WHERE id = NEW.project_id), ''); END IF;
  RETURN NEW;
END $$;`;

const perTable = (t: string) => `
ALTER TABLE ${t} ADD COLUMN org_id TEXT NOT NULL DEFAULT '';
UPDATE ${t} SET org_id = p.org_id FROM projects p WHERE p.id = ${t}.project_id;
CREATE TRIGGER ${t}_org BEFORE INSERT ON ${t} FOR EACH ROW EXECUTE FUNCTION wl_org_of_project();`;

export const ORGS_MIGRATION = [STAMP, ...ORG_TABLES.map(perTable)].join("\n");
