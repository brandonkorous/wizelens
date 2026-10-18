// Migration 6: addresses mail must skip. A hard bounce skips every email; a spam complaint skips all but mail the person asked for.
export const MAIL_MIGRATION = `
CREATE TABLE mail_suppressions (
  email TEXT NOT NULL PRIMARY KEY, reason TEXT NOT NULL CHECK (reason IN ('bounce', 'complaint')), detail TEXT NOT NULL,
  created_ms DOUBLE PRECISION NOT NULL
);
`;
