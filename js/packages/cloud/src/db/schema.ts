import { ALERT_PROBLEM_MIGRATION, ALERTS2_MIGRATION } from "./schema-alerts.js";
import { AUTH_MIGRATION } from "./schema-auth.js";
import { BASE_MIGRATIONS } from "./schema-base.js";
import { LOGS_MIGRATION } from "./schema-logs.js";
import { BILLING_MIGRATION } from "./schema-billing.js";
import { MAIL_MIGRATION } from "./schema-mail.js";
import { NOTIFY_MIGRATION, ZONE_SET_MIGRATION } from "./schema-notify.js";
import { ISSUES_MIGRATION } from "./schema-issues.js";
import { OAUTH_MIGRATION } from "./schema-oauth.js";
import { SAVED_MIGRATION, SAVED_ORG_MIGRATION, SHARE_NOTE_MIGRATION } from "./schema-saved.js";
import { UI_PREFS_MIGRATION } from "./schema-ui-prefs.js";
import { SCIM_MIGRATION } from "./schema-scim.js";
import { SEARCH_MIGRATION } from "./schema-search.js";
import { SOURCEMAPS_MIGRATION } from "./schema-sourcemaps.js";
import { SLOS_MIGRATION } from "./schema-slos.js";
import { SSO_MIGRATION, SSO_REMOVED_MIGRATION, SSO_REQUIRED_MIGRATION } from "./schema-sso.js";
import { UPTIME_MIGRATION } from "./schema-uptime.js";
import { TAGS_MIGRATION } from "./schema-tags.js";
import { TEAM_MIGRATION } from "./schema-team.js";
import { SAVED_MOVE_MIGRATION } from "./schema-saved-move.js";
import { ORGS_MIGRATION, READER_MIGRATION } from "./schema-orgs.js";
import { PACKAGES_MIGRATION } from "./schema-packages.js";
import { BROWSER_KEYS_MIGRATION, KEY_EXPOSED_MIGRATION, KEY_REVOKED_USE_MIGRATION } from "./schema-keys.js";
import { PAGING_MIGRATION } from "./schema-paging.js";
import { SEEN_MIGRATION } from "./schema-seen.js";

// Cloud schema, one entry per version. Never edit a shipped entry: add a new one (docs/CONTRACT.md, "Cloud storage").
export const MIGRATIONS: readonly string[] = [
  ...BASE_MIGRATIONS,
  AUTH_MIGRATION,
  SSO_MIGRATION,
  MAIL_MIGRATION,
  NOTIFY_MIGRATION,
  SEARCH_MIGRATION,
  OAUTH_MIGRATION,
  ISSUES_MIGRATION,
  ALERTS2_MIGRATION,
  SLOS_MIGRATION,
  SAVED_MIGRATION,
  BILLING_MIGRATION,
  SCIM_MIGRATION,
  TAGS_MIGRATION,
  UPTIME_MIGRATION,
  SOURCEMAPS_MIGRATION,
  LOGS_MIGRATION,
  ALERT_PROBLEM_MIGRATION,
  TEAM_MIGRATION,
  SAVED_MOVE_MIGRATION,
  ORGS_MIGRATION,
  READER_MIGRATION,
  SAVED_ORG_MIGRATION,
  PACKAGES_MIGRATION,
  BROWSER_KEYS_MIGRATION,
  PAGING_MIGRATION,
  SEEN_MIGRATION,
  KEY_EXPOSED_MIGRATION,
  ZONE_SET_MIGRATION,
  KEY_REVOKED_USE_MIGRATION,
  SSO_REQUIRED_MIGRATION,
  SSO_REMOVED_MIGRATION,
  SHARE_NOTE_MIGRATION,
  UI_PREFS_MIGRATION,
];

export const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS wizelens_migrations (version INTEGER PRIMARY KEY, applied_ms DOUBLE PRECISION NOT NULL)`;
