// Connecting an app (an MCP client such as Claude) with OAuth: the signed query Better Auth hands the dashboard, and the calls it needs.
import { auth } from "./account";

const KEY = "wl-oauth-query";
/** Better Auth's own parameters on a signed query; the rest is the app's original authorize request. */
const SIGNING = new Set(["sig", "exp", "ba_iat", "ba_pl", "ba_param"]);

/** The app's client id and where it sends the person back, from a signed query. */
export function oauthRequest(query: string): { clientId: string; returnHost: string } {
  const p = new URLSearchParams(query);
  const uri = p.get("redirect_uri") ?? "";
  return { clientId: p.get("client_id") ?? "", returnHost: URL.canParse(uri) ? new URL(uri).host : uri };
}

const expired = (query: string) => Number(new URLSearchParams(query).get("exp") ?? 0) * 1000 < Date.now();

/** The signed query while the person signs in. Session storage: the second sign-in step opens another page in this tab. */
export const pendingOAuth = {
  get: (): string | null => {
    try {
      const q = sessionStorage.getItem(KEY);
      return q && !expired(q) ? q : null;
    } catch {
      return null;
    }
  },
  set: (query: string | null): void => {
    try {
      if (query) sessionStorage.setItem(KEY, query);
      else sessionStorage.removeItem(KEY);
    } catch {
      // Storage can be off; the query then rides only on the OAuth pages themselves.
    }
  },
};

/** Start the app's authorization again, now signed in. Better Auth sends the browser on to the consent page. */
export function resumeAuthorize(query: string): void {
  const p = new URLSearchParams([...new URLSearchParams(query)].filter(([k]) => !SIGNING.has(k)));
  window.location.assign(`api/auth/oauth2/authorize?${p.toString()}`);
}

export interface PublicClient {
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
}

/** The app's name and site, as it registered them. */
export const publicClient = (clientId: string) => auth((c) => c.$fetch<PublicClient>("/oauth2/public-client", { method: "GET", query: { client_id: clientId } }));

export interface GrantChoice {
  organizationId: string;
  allProjects: boolean;
  projectIds: string[];
}

/** Save what the app may read, then give consent. Better Auth answers with the app's address; the browser goes there. */
export async function allowApp(query: string, choice: GrantChoice): Promise<void> {
  await auth((c) => c.$fetch("/wizelens/oauth-grant", { method: "POST", body: { ...choice, oauth_query: query } }));
  await finishConsent(query, true);
}

export async function finishConsent(query: string, accept: boolean): Promise<void> {
  const done = await auth((c) => c.$fetch<{ url?: string; redirect_uri?: string }>("/oauth2/consent", { method: "POST", body: { accept, oauth_query: query } }));
  pendingOAuth.set(null);
  const to = done.url ?? done.redirect_uri;
  if (to) window.location.assign(to);
}
