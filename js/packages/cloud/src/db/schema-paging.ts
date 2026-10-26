// One rule's alert events read a page at a time, newest first.
export const PAGING_MIGRATION = `
CREATE INDEX ix_alert_events_rule ON alert_events (rule_id, time_ms);
`;
