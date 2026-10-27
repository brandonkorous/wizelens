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

/** Migration 24: scoped reads run as `wl_reader`, which row level security holds to the organization in `wl.org`. The owner (every writer) is not subject to it. */
// A managed server's app user may not create roles: the admin makes it first (deploy/k8s/jobs/db-role.sql).
const READER = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wl_reader') THEN
    BEGIN
      CREATE ROLE wl_reader NOLOGIN;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Make the role wl_reader as the database admin first (deploy/k8s/jobs/db-role.sql), or let this user create roles.';
    END;
  END IF;
  IF NOT pg_has_role(current_user, 'wl_reader', 'MEMBER') THEN
    EXECUTE format('GRANT wl_reader TO %I', current_user);
  END IF;
END $$;`;

export const orgPolicy = (t: string): string => `
GRANT SELECT ON ${t} TO wl_reader;
ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
CREATE POLICY wl_org ON ${t} FOR SELECT TO wl_reader USING (org_id = current_setting('wl.org'));`;

export const READER_MIGRATION = [READER, ...ORG_TABLES.map(orgPolicy)].join("\n");
