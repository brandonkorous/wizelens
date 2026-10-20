// Migration 22: saved log searches move into saved_items as shared searches of the Logs page, drawn as charts; saved_searches goes.
const enc = (v: string) => `replace(replace(replace(replace(replace(replace(${v}, '%', '%25'), '&', '%26'), '=', '%3D'), '#', '%23'), '+', '%2B'), ' ', '%20')`;

export const SAVED_MOVE_MIGRATION = `
INSERT INTO saved_items (id, project_id, owner_id, kind, name, shared, body, created_ms, updated_ms)
SELECT s.id, s.project_id, CASE WHEN s.created_by LIKE 'user:%' THEN substr(s.created_by, 6) ELSE s.created_by END, 'search', s.name, TRUE,
  json_build_object('href', '#/logs' || COALESCE('?' || (SELECT string_agg(e.key || '=' || ${enc("e.value")}, '&' ORDER BY e.key)
    FROM jsonb_each_text(s.params::jsonb) e WHERE e.value <> ''), ''), 'panels', json_build_array(), 'chart', TRUE)::text,
  s.created_ms, s.created_ms
FROM saved_searches s
ON CONFLICT (id) DO NOTHING;
DROP TABLE saved_searches;
`;
