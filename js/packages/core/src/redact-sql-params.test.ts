import { describe, expect, it } from "vitest";
import { redactParams } from "./redact.js";
import { paramColumns } from "./redact-sql-params.js";

describe("paramColumns", () => {
  it("reads the column of each placeholder, in every style", () => {
    expect([...paramColumns('select "id" from "auth_sessions" where "auth_sessions"."token" = $1 limit $2')]).toEqual([[0, "token"]]);
    expect([...paramColumns("select * from users where email = ? and age > ?")]).toEqual([[0, "email"], [1, "age"]]);
    expect([...paramColumns("select * from t where note = '?' and name like %s")]).toEqual([[0, "name"]]);
    expect([...paramColumns('update "users" set "password" = $1 where "id" in ($2)')]).toEqual([[0, "password"], [1, "id"]]);
  });

  it("reads the columns of an insert, skipping defaults", () => {
    const sql = 'insert into "auth_accounts" ("id", "user_id", "password", "created_at") values ($1, $2, $3, default)';
    expect([...paramColumns(sql)]).toEqual([[0, "id"], [1, "user_id"], [2, "password"]]);
  });
});

describe("redactParams with the query", () => {
  it("hides values bound to token, password and email columns, and keeps the rest", () => {
    const token = 'select "id" from "auth_sessions" where "auth_sessions"."token" = $1 limit $2';
    expect(redactParams(["AIJDisnqGFxkte6iHIaCitQ357eUDfdn", 1], undefined, token)).toBe('["[redacted]",1]');
    expect(redactParams(["p01.dani@kanninja.test"], undefined, 'select * from "auth_users" where "auth_users"."email" = $1')).toBe('["[redacted]"]');
    expect(redactParams(["Q4 Workshop"], undefined, 'select * from "boards" where "title" = $1')).toBe('["Q4 Workshop"]');
  });

  it("hides secrets found by pattern in any value, and email keys by name", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlX3ZhbHVlX2hlcmU";
    expect(redactParams([jwt], undefined, "select * from t where note = $1")).toBe('["[redacted:jwt]"]');
    expect(redactParams({ userEmail: "a@b.c", id: 2 })).toBe('{"userEmail":"[redacted]","id":2}');
  });
});
