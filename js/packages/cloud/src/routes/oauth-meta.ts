import type { IncomingMessage, ServerResponse } from "node:http";
import type { CloudApp } from "../app.js";
import { OAUTH_SCOPES } from "../auth/oauth.js";
import { AUTH_BASE_PATH } from "../auth/options.js";
import { sendJson } from "../http/http.js";

const PRM = "/.well-known/oauth-protected-resource";
const ASM = "/.well-known/oauth-authorization-server";
const MCP_PATH = "/_wizelens/mcp";
const DOCS = "https://wizelens.com/docs/ai-access/";
/** Public, so browser MCP clients can read it too; an hour in caches. */
const OPEN = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" };

/** True when the request came in on the MCP origin (`--mcp-url`), where a proxy sends `/` and `/mcp` to `/_wizelens/mcp`. */
const onMcpOrigin = (app: CloudApp, req: IncomingMessage): boolean => !!app.config.mcpUrl && req.headers.host === new URL(app.config.mcpUrl).host;

/** Where an agent that got a 401 finds how to sign in (RFC 9728), on the origin it called. */
export function resourceMetadataUrl(app: CloudApp, req: IncomingMessage): string {
  return onMcpOrigin(app, req) ? `${app.config.mcpUrl}${PRM}` : `${app.baseUrl()}${PRM}${MCP_PATH}`;
}

/** The resource a metadata path names: on the MCP origin its own path (bare or `/mcp`), else the cloud's MCP path. */
function resourceOf(app: CloudApp, req: IncomingMessage, suffix: string): string {
  if (onMcpOrigin(app, req)) return suffix === "/mcp" ? `${app.config.mcpUrl}/mcp` : app.config.mcpUrl!;
  return `${app.baseUrl()}${MCP_PATH}`;
}

function protectedResource(app: CloudApp, req: IncomingMessage, res: ServerResponse, suffix: string): void {
  sendJson(res, 200, {
    resource: resourceOf(app, req, suffix),
    authorization_servers: [`${app.baseUrl()}${AUTH_BASE_PATH}`],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "WizeLens",
    resource_documentation: DOCS,
  }, OPEN);
}

async function authorizationServer(app: CloudApp, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const request = new Request(`${app.baseUrl()}${req.url ?? "/"}`, { headers: { accept: "application/json" } });
  sendJson(res, 200, await app.auth.api.getOAuthServerConfig({ request, asResponse: false }), OPEN);
}

/** `/.well-known/oauth-protected-resource[/path]` and `/.well-known/oauth-authorization-server[/path]`. False: not one of them. */
export async function serveOAuthMetadata(app: CloudApp, req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") return false;
  const prm = path === PRM || path.startsWith(`${PRM}/`);
  const asm = path === ASM || path === `${ASM}${AUTH_BASE_PATH}`;
  if (!prm && !asm) return false;
  if (req.method === "OPTIONS") return (res.writeHead(204, { ...OPEN, "Access-Control-Allow-Headers": "*" }).end(), true);
  if (prm) protectedResource(app, req, res, path.slice(PRM.length));
  else await authorizationServer(app, req, res);
  return true;
}
