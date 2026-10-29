import { useEffect } from "react";
import type { AccountState } from "../../data/account";
import { pendingOAuth, resumeAuthorize } from "../../data/oauth";
import { hrefTo, type Route } from "../../routes";
import { AuthCard } from "./AuthForm";
import { AuthScreen } from "./AuthScreen";
import { ConsentScreen } from "./ConsentScreen";

/** The two pages Better Auth sends an app's sign-in to. */
export const isOAuthPage = (page: string) => page === "oauth" || page === "oauth-consent";

/** Keep the signed query from the address, so the sign-in steps can carry it. */
function useCapture(route: Route): string {
  const query = route.query.has("sig") ? route.query.toString() : (pendingOAuth.get() ?? "");
  useEffect(() => {
    if (route.query.has("sig")) pendingOAuth.set(route.query.toString());
  }, [route.query]);
  return query;
}

/** Signed in already: back to the app's authorization, which goes on to the consent page. */
function Resume({ query }: { query: string }) {
  useEffect(() => resumeAuthorize(query), [query]);
  return <AuthCard title="One moment…" intro="Taking you to the next step." />;
}

const Expired = () => (
  <AuthCard title="This link has expired" intro="Go back to the app you were connecting, and connect it again. Nothing was shared.">
    <a className="wl-btn wl-btn-primary" href={hrefTo("overview")}>Open WizeLens</a>
  </AuthCard>
);

/** `#/oauth` (sign in, then go on) and `#/oauth-consent` (pick what the app may read). */
export function OAuthScreen({ route, state }: { route: Route; state: AccountState }) {
  const query = useCapture(route);
  if (!query) return <Expired />;
  if (!state.signedIn) return <AuthScreen state={state} intro="Sign in to connect an app to WizeLens. Next you choose what it may read." />;
  if (route.page === "oauth") return <Resume query={query} />;
  return <ConsentScreen query={query} state={state} />;
}
