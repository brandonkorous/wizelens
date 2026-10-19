// Migration 14: plans, usage per day, and Stripe (names in auth/schema-names.ts). Existing organizations stay unlimited.
export const BILLING_MIGRATION = `
ALTER TABLE orgs ADD COLUMN plan TEXT NOT NULL DEFAULT 'unlimited';
ALTER TABLE orgs ADD COLUMN plan_gb DOUBLE PRECISION;
ALTER TABLE orgs ADD COLUMN plan_retention_days INTEGER;
ALTER TABLE orgs ADD COLUMN spend_cap_cents INTEGER;
ALTER TABLE orgs ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE orgs ADD COLUMN overage_subscription_id TEXT;
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
CREATE TABLE subscriptions (
  id TEXT NOT NULL PRIMARY KEY, plan TEXT NOT NULL, reference_id TEXT NOT NULL, stripe_customer_id TEXT, stripe_subscription_id TEXT,
  status TEXT, period_start TIMESTAMPTZ, period_end TIMESTAMPTZ, trial_start TIMESTAMPTZ, trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN, cancel_at TIMESTAMPTZ, canceled_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, seats INTEGER,
  billing_interval TEXT, stripe_schedule_id TEXT
);
CREATE INDEX ix_subscriptions_reference ON subscriptions (reference_id);
CREATE INDEX ix_subscriptions_stripe ON subscriptions (stripe_subscription_id);
CREATE TABLE usage_daily (
  org_id TEXT NOT NULL REFERENCES orgs (id) ON DELETE CASCADE, day TEXT NOT NULL, bytes DOUBLE PRECISION NOT NULL DEFAULT 0,
  spans DOUBLE PRECISION NOT NULL DEFAULT 0, logs DOUBLE PRECISION NOT NULL DEFAULT 0, points DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, day)
);
CREATE TABLE usage_notices (
  org_id TEXT NOT NULL REFERENCES orgs (id) ON DELETE CASCADE, month TEXT NOT NULL, kind TEXT NOT NULL, sent_ms DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (org_id, month, kind)
);
CREATE TABLE usage_reports (
  org_id TEXT NOT NULL REFERENCES orgs (id) ON DELETE CASCADE, day TEXT NOT NULL, gb DOUBLE PRECISION NOT NULL, reported_ms DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (org_id, day)
);
CREATE TABLE scim_tokens (
  id TEXT NOT NULL PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs (id) ON DELETE CASCADE, name TEXT NOT NULL, prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL, last_used_ms DOUBLE PRECISION,
  revoked_ms DOUBLE PRECISION
);
CREATE INDEX ix_scim_tokens_org ON scim_tokens (org_id);
`;
