import json
from pathlib import Path

from wizelens import Settings
from wizelens.sql import params_json
from wizelens.sql_params import param_columns

SETTINGS = Settings.from_env({})

# The shared cases in docs/redact-vectors.json; the TS, Go and .NET suites run the same file.
VECTORS = json.loads((Path(__file__).parents[2] / "docs" / "redact-vectors.json").read_text(encoding="utf-8"))


def test_params_vectors_redact_by_name_or_column():
    assert VECTORS["params"]
    for c in VECTORS["params"]:
        assert json.loads(params_json(c["params"], SETTINGS, c["sql"])) == c["want"], c["sql"]


def test_param_columns_read_every_style():
    assert param_columns('select "id" from "auth_sessions" where "auth_sessions"."token" = $1 limit $2') == {"0": "token"}
    assert param_columns("select * from users where email = ? and age > ?") == {"0": "email", "1": "age"}
    assert param_columns("select * from t where note = '?' and name like %s") == {"0": "name"}
    assert param_columns('update "users" set "password" = $1 where "id" in ($2)') == {"0": "password", "1": "id"}
    assert param_columns("SELECT * FROM [Users] WHERE [Users].[Email] = @p0 AND created::date > :since") == {"p0": "Email", "since": "created"}
    assert param_columns("select * from users where api_key = %(k)s") == {"k": "api_key"}
    assert param_columns("INSERT INTO [Users] ([Name], [Email]) VALUES (@p0, @p1)") == {"p0": "Name", "p1": "Email"}
    assert param_columns("select * from t where a=:x and b like:y") == {"x": "a"}


def test_params_keep_letters_as_typed():
    # Persona #072: "Peña Ridge 2-Person Tent — 3-season" must not read "Peña ... —".
    text = params_json(["Peña Ridge 2-Person Tent — 3-season"], SETTINGS, "update catalog set name = ?")
    assert "Peña Ridge 2-Person Tent — 3-season" in text
