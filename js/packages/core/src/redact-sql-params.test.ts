import { describe, expect, it } from "vitest";
import { paramColumns } from "./redact-sql-params.js";

const cols = (sql: string) => Object.fromEntries(paramColumns(sql));

describe("paramColumns", () => {
  it("reads the column of each placeholder, in every style", () => {
    expect(cols('select "id" from "auth_sessions" where "auth_sessions"."token" = $1 limit $2')).toEqual({ "0": "token" });
    expect(cols("select * from users where email = ? and age > ?")).toEqual({ "0": "email", "1": "age" });
    expect(cols("select * from t where note = '?' and name like %s")).toEqual({ "0": "name" });
    expect(cols('update "users" set "password" = $1 where "id" in ($2)')).toEqual({ "0": "password", "1": "id" });
    expect(cols("SELECT * FROM [Users] WHERE [Users].[Email] = @p0 AND created::date > :since")).toEqual({ p0: "Email", since: "created" });
    expect(cols("select * from users where api_key = %(k)s")).toEqual({ k: "api_key" });
  });

  it("reads the columns of an insert, skipping defaults", () => {
    const sql = 'insert into "auth_accounts" ("id", "user_id", "password", "created_at") values ($1, $2, $3, default)';
    expect(cols(sql)).toEqual({ "0": "id", "1": "user_id", "2": "password" });
    expect(cols("INSERT INTO [Users] ([Name], [Email]) VALUES (@p0, @p1)")).toEqual({ p0: "Name", p1: "Email" });
  });
});
