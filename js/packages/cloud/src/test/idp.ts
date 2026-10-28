import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface IdpUser {
  sub: string;
  email: string;
  name: string;
}

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

function json(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function formOf(req: IncomingMessage): Promise<URLSearchParams> {
  let text = "";
  for await (const chunk of req) text += String(chunk);
  return new URLSearchParams(text);
}

/** How the test IdP answers a refresh: renews it, refuses it (the person was turned off), or is down. */
export type IdpMode = "ok" | "disabled" | "down";

/** A tiny OIDC identity provider for tests: discovery, authorize (signs `user` straight in), token with an RS256 ID token and a refresh token, refresh, and JWKS. */
export async function startIdp(user: IdpUser, clientId: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
  const codes = new Set<string>();
  const refreshes = new Set<string>();
  let mode: IdpMode = "ok";
  const tokens = () => {
    const refresh = randomUUID();
    refreshes.add(refresh);
    return { access_token: randomUUID(), token_type: "Bearer", expires_in: 300, refresh_token: refresh, id_token: idToken() };
  };
  let issuer = "";
  const idToken = () => {
    const now = Math.floor(Date.now() / 1000);
    const body = `${b64({ alg: "RS256", typ: "JWT", kid: "k1" })}.${b64({ iss: issuer, aud: clientId, iat: now, exp: now + 300, email_verified: true, ...user })}`;
    return `${body}.${createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64url")}`;
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", issuer);
    if (url.pathname === "/.well-known/openid-configuration") {
      return json(res, { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"], token_endpoint_auth_methods_supported: ["client_secret_basic"] });
    }
    if (url.pathname === "/jwks") return json(res, { keys: [jwk] });
    if (url.pathname === "/authorize") {
      const code = randomUUID();
      codes.add(code);
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    const form = await formOf(req);
    if (url.pathname === "/token" && form.get("grant_type") === "refresh_token") {
      if (mode === "down") return void res.writeHead(503).end();
      if (mode === "disabled" || !refreshes.delete(form.get("refresh_token") ?? "")) return void res.writeHead(400, { "Content-Type": "application/json" }).end('{"error":"invalid_grant"}');
      return json(res, tokens());
    }
    if (url.pathname !== "/token" || !codes.delete(form.get("code") ?? "")) return void res.writeHead(400).end();
    json(res, tokens());
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { issuer, setMode: (m: IdpMode) => void (mode = m), close: () => new Promise<void>((done) => server.close(() => done())) };
}
