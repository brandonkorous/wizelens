// The Preferences page's choices on the account, so every browser a person signs in on starts with them.
export const UI_PREFS_MIGRATION = `
CREATE TABLE ui_prefs (user_id TEXT NOT NULL PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, prefs TEXT NOT NULL DEFAULT '{}');`;
