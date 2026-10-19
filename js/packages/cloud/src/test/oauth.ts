import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Client } from "./cloud.js";

export const REDIRECT = "https://claude.example/api/mcp/auth_callback";

/** What the person picks on the consent page. */
export type Pick = { organizationId: string; projectIds?: string[]; allProjects?: boolean };

/** An MCP client's OAuth state, kept in memory like Claude keeps it. `browse` plays the person's browser. */
export class TestAuth implements OAuthClientProvider {
  client?: OAuthClientInformationMixed;
  saved?: OAuthTokens;
  verifier = "";
  code = "";
  scope?: string;

  constructor(private readonly browse: (authorize: URL) => Promise<string>) {}

  get redirectUrl(): string {
    return REDIRECT;
  }

  get clientMetadata() {
    return { client_name: "Claude", redirect_uris: [REDIRECT], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", ...(this.scope ? { scope: this.scope } : {}) };
  }

  clientInformation = () => this.client;
  saveClientInformation = (c: OAuthClientInformationMixed) => void (this.client = c);
  tokens = () => this.saved;
  saveTokens = (t: OAuthTokens) => void (this.saved = t);
  saveCodeVerifier = (v: string) => void (this.verifier = v);
  codeVerifier = () => this.verifier;

  async redirectToAuthorization(url: URL): Promise<void> {
    this.code = await this.browse(url);
  }
}

/** The signed query on a dashboard page Better Auth sent the browser to: everything after the hash route's `?`. */
export const hashQuery = (location: string): string => location.slice(location.indexOf("?") + 1);

/** The person, signed in as `person`, opens the authorize link, picks projects, and allows. Returns the code for the app. */
export function consentAs(base: string, person: Client, pick: Pick): (authorize: URL) => Promise<string> {
  return async (authorize) => {
    const res = await fetch(authorize, { headers: { Cookie: person.cookie, Accept: "text/html" }, redirect: "manual" });
    // A browser gets a 302; Better Auth answers a script's fetch with the same address as JSON.
    const location = res.headers.get("location") ?? ((await res.json()) as { url?: string }).url ?? "";
    if (!location.includes("#/oauth-consent")) throw new Error(`expected the consent page, got ${res.status} ${location}`);
    const oauth_query = hashQuery(location);
    const grant = await person.call("POST", "api/auth/wizelens/oauth-grant", { ...pick, oauth_query });
    if (grant.status !== 200) throw new Error(`grant failed: ${grant.status} ${JSON.stringify(grant.body)}`);
    const done = await person.call<{ url?: string; redirect_uri?: string }>("POST", "api/auth/oauth2/consent", { accept: true, oauth_query });
    const back = new URL(done.body.url ?? done.body.redirect_uri ?? "", base);
    const code = back.searchParams.get("code");
    if (!code) throw new Error(`no code: ${done.status} ${JSON.stringify(done.body)}`);
    return code;
  };
}

/** Connect like Claude: a 401 starts OAuth (discovery, registration, PKCE), the person consents, then the client connects again. */
export async function connectWithOAuth(mcpUrl: string, auth: TestAuth): Promise<McpClient> {
  const open = async () => {
    const client = new McpClient({ name: "claude-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), { authProvider: auth });
    try {
      await client.connect(transport);
      return client;
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) throw err;
      await transport.finishAuth(auth.code);
      return undefined;
    }
  };
  const client = (await open()) ?? (await open());
  if (!client) throw new Error("could not connect after OAuth");
  return client;
}
