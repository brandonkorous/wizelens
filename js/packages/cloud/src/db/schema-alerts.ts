// Alert rules scoped to a service or endpoint, reminders, mute, acknowledge, and every evaluated value (for the rule's history).
export const ALERTS2_MIGRATION = `
ALTER TABLE alert_rules ADD COLUMN service TEXT NOT NULL DEFAULT '';
ALTER TABLE alert_rules ADD COLUMN endpoint TEXT NOT NULL DEFAULT '';
ALTER TABLE alert_rules ADD COLUMN remind_ms DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE alert_rules ADD COLUMN muted_until_ms DOUBLE PRECISION;
ALTER TABLE alert_rules ADD COLUMN ack_ms DOUBLE PRECISION;
ALTER TABLE alert_rules ADD COLUMN last_notified_ms DOUBLE PRECISION;
CREATE TABLE alert_values (
  rule_id TEXT NOT NULL REFERENCES alert_rules (id) ON DELETE CASCADE, time_ms DOUBLE PRECISION NOT NULL, value DOUBLE PRECISION,
  PRIMARY KEY (rule_id, time_ms)
);
CREATE INDEX ix_alert_values_time ON alert_values (time_ms);
`;
