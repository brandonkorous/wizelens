import { request } from "node:http";
import { afterEach, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { Client, PASSWORD, setupOwner, startCloud } from "./test/cloud.js";
import { hashQuery, REDIRECT } from "./test/oauth.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

/** A GET with our own Host header, as the proxy for the MCP origin sends it. */
function getWithHost(url: string, path: string, host: string): Promise<{ status: number; body: string }> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve, reject) => {
    const req = request({ hostname, port, path, headers: { Host: host } }, (res) => {
      let body = "";
      res.on("data", (c: Buffer) => (body += c.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject).end();
  });
}

/** Register an app the way an MCP client does, with no account. */
async function register(url: string): Promise<string> {
  const body = { client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
  const res = await fetch(`${url}/_wizelens/api/auth/oauth2/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

it("on the MCP origin, the metadata names that origin and the 401 points there", async () => {
  let url: string;
  ({ cloud, url } = await startCloud({ mcpUrl: "https://mcp.example.com" }));
  const bare = JSON.parse((await getWithHost(url, "/.well-known/oauth-protected-resource", "mcp.example.com")).body) as { resource: string; authorization_servers: string[] };
  expect(bare).toMatchObject({ resource: "https://mcp.example.com", authorization_servers: [`${url}/_wizelens/api/auth`] });
  const withPath = JSON.parse((await getWithHost(url, "/.well-known/oauth-protected-resource/mcp", "mcp.example.com")).body) as { resource: string };
  expect(withPath.resource).toBe("https://mcp.example.com/mcp");
  const { hostname, port } = new URL(url);
  const challenge = await new Promise<string>((resolve, reject) => {
    const req = request({ hostname, port, path: "/_wizelens/mcp", method: "POST", headers: { Host: "mcp.example.com", "Content-Type": "application/json" } }, (res) => resolve(String(res.headers["www-authenticate"] ?? "")));
    req.on("error", reject).end("{}");
  });
  expect(challenge).toContain('resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"');
});

it("sends a signed-out person to sign in, and signing in goes on to the consent page", async () => {
  let url: string;
  ({ cloud, url } = await startCloud());
  await setupOwner(cloud, url);
  const clientId = await register(url);
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, scope: "wizelens:read", code_challenge: "x".repeat(43), code_challenge_method: "S256", state: "s1" });
  const first = await fetch(`${url}/_wizelens/api/auth/oauth2/authorize?${q}`, { headers: { Accept: "text/html" }, redirect: "manual" });
  const login = first.headers.get("location") ?? ((await first.json()) as { url: string }).url;
  expect(login).toMatch(/^\/_wizelens\/#\/oauth\?/);
  const person = new Client(url);
  const signIn = await person.call<{ url?: string }>("POST", "api/auth/sign-in/email", { email: "owner@acme.io", password: PASSWORD, oauth_query: hashQuery(login) });
  expect(signIn.status).toBe(200);
  expect(signIn.body.url).toMatch(/^\/_wizelens\/#\/oauth-consent\?/);
  expect(new URLSearchParams(hashQuery(signIn.body.url!)).get("scope")).toBe("wizelens:read offline_access");
});

it("refuses an app that registers for machine tokens without an account", async () => {
  let url: string;
  ({ cloud, url } = await startCloud());
  const body = { client_name: "M2M", redirect_uris: [REDIRECT], grant_types: ["client_credentials"], token_endpoint_auth_method: "client_secret_basic" };
  const res = await fetch(`${url}/_wizelens/api/auth/oauth2/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  expect(res.status).toBeGreaterThanOrEqual(400);
});
