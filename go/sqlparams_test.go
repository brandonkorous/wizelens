package wizelens

import (
	"database/sql/driver"
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// paramsVector is one case of the params section in docs/redact-vectors.json; the TS, Python and .NET suites run the same file.
type paramsVector struct {
	SQL    string `json:"sql"`
	Params any    `json:"params"`
	Want   any    `json:"want"`
}

func vectorArgs(params any) []driver.NamedValue {
	var args []driver.NamedValue
	switch p := params.(type) {
	case []any:
		for i, v := range p {
			args = append(args, driver.NamedValue{Ordinal: i + 1, Value: v})
		}
	case map[string]any:
		for k, v := range p {
			args = append(args, driver.NamedValue{Name: k, Ordinal: len(args) + 1, Value: v})
		}
	}
	return args
}

func TestParamsVectorsRedactByNameOrColumn(t *testing.T) {
	raw, err := os.ReadFile("../docs/redact-vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct{ Params []paramsVector }
	if err := json.Unmarshal(raw, &v); err != nil || len(v.Params) == 0 {
		t.Fatalf("no params vectors: %v", err)
	}
	s := SettingsFrom(func(string) string { return "" })
	for _, c := range v.Params {
		var got any
		if err := json.Unmarshal([]byte(ParamsJSON(c.SQL, vectorArgs(c.Params), s)), &got); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, c.Want) {
			t.Errorf("%s: got %v, want %v", c.SQL, got, c.Want)
		}
	}
}

func TestParamColumnsReadEveryStyle(t *testing.T) {
	cases := map[string]map[string]string{
		`select "id" from "auth_sessions" where "auth_sessions"."token" = $1 limit $2`: {"0": "token"},
		"select * from users where email = ? and age > ?":                              {"0": "email", "1": "age"},
		"select * from t where note = '?' and name like %s":                            {"0": "name"},
		`update "users" set "password" = $1 where "id" in ($2)`:                        {"0": "password", "1": "id"},
		"SELECT * FROM [Users] WHERE [Users].[Email] = @p0 AND created::date > :since": {"p0": "Email", "since": "created"},
		"select * from users where api_key = %(k)s":                                    {"k": "api_key"},
		"INSERT INTO [Users] ([Name], [Email]) VALUES (@p0, @p1)":                      {"p0": "Name", "p1": "Email"},
		"select * from t where a=:x and b like:y":                                      {"x": "a"},
	}
	for sql, want := range cases {
		if got := paramColumns(sql); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: got %v, want %v", sql, got, want)
		}
	}
}
