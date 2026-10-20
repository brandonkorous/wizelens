-- Makes the role WizeLens Cloud connects as. Run as the server admin; safe to run again.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wizelens_app') THEN
    CREATE ROLE wizelens_app LOGIN;
  END IF;
END
$do$;
ALTER ROLE wizelens_app LOGIN PASSWORD :'app_password';
GRANT CONNECT, TEMPORARY ON DATABASE wizelens TO wizelens_app;
-- The cloud migrates itself at start, so it creates and owns its tables in this one schema.
GRANT USAGE, CREATE ON SCHEMA public TO wizelens_app;
-- Scoped reads run as wl_reader, which row level security holds to one organization (docs/ALL-PROJECTS-PLAN.md, phase C).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wl_reader') THEN
    CREATE ROLE wl_reader NOLOGIN;
  END IF;
END
$do$;
GRANT wl_reader TO wizelens_app;
