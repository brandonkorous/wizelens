// Migration 26: the packages each service runs (docs/SECURITY-PLAN.md phase 7), and the OSV answers about them, shared by every project.
export const PACKAGES_MIGRATION = `
CREATE TABLE service_packages (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE, service TEXT NOT NULL, ecosystem TEXT NOT NULL,
  name TEXT NOT NULL, version TEXT NOT NULL, first_ms DOUBLE PRECISION NOT NULL, seen_ms DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (project_id, service, ecosystem, name, version)
);
CREATE TABLE package_checks (
  ecosystem TEXT NOT NULL, name TEXT NOT NULL, version TEXT NOT NULL, vulns TEXT NOT NULL, checked_ms DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (ecosystem, name, version)
);
CREATE TABLE advisories (id TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_ms DOUBLE PRECISION NOT NULL);
`;
