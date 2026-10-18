import type { Ctx } from "../app.js";
import { readRawBody } from "../http/http.js";
import { applyStop, type StopScope } from "../repo/mail-prefs.js";
import { theme } from "./theme.js";
import { readStop } from "./unsubscribe.js";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function labelOf(ctx: Ctx, scope: StopScope): Promise<string> {
  if (scope === "team") return "emails about team changes";
  if (scope === "health") return "emails when a project goes quiet";
  if (scope === "digests") return "every digest";
  const [p] = await ctx.app.db.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [scope.projectId]);
  return `the ${scope.period} digest for ${p?.name ?? "this project"}`;
}

function page(ctx: Ctx, status: number, title: string, body: string): void {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escape(title)}</title><style>body{margin:0;padding:48px 16px;background:${theme.page};font-family:${theme.sans};color:${theme.body}}
main{max-width:480px;margin:0 auto;background:${theme.card};border:1px solid ${theme.line};border-radius:${theme.radius};padding:32px}
h1{margin:0 0 12px;font-size:24px;letter-spacing:-0.02em;color:${theme.ink}}button{background:${theme.accent};color:#fff;border:0;border-radius:8px;padding:12px 20px;font:600 15px ${theme.sans};cursor:pointer}
a{color:${theme.accent}}</style></head><body><main><h1>${escape(title)}</h1>${body}</main></body></html>`;
  ctx.res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" });
  ctx.res.end(html);
}

/** GET shows a button (mail scanners open links, so a GET changes nothing). POST turns the mail off; it is also the RFC 8058 one-click call. */
export async function stopRoute(ctx: Ctx): Promise<void> {
  const token = ctx.url.searchParams.get("token") ?? "";
  const stop = readStop(ctx.app.secrets, token);
  if (!stop) return page(ctx, 400, "This link does not work.", "<p>Change your emails on the Account page in WizeLens instead.</p>");
  const label = await labelOf(ctx, stop.scope);
  const account = `${ctx.app.baseUrl()}/_wizelens/#/account`;
  if (ctx.req.method !== "POST") {
    const form = `<form method="post" action="?token=${escape(encodeURIComponent(token))}"><button type="submit">Stop ${escape(label)}</button></form>`;
    return page(ctx, 200, "Stop these emails?", `<p>You will not get ${escape(label)} any more.</p>${form}`);
  }
  await readRawBody(ctx.req);
  await applyStop(ctx.app.db, stop.userId, stop.scope);
  page(ctx, 200, "Done.", `<p>You will not get ${escape(label)} any more. Turn it back on any time on <a href="${escape(account)}">your Account page</a>.</p>`);
}
