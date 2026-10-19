import { type ReactNode, useEffect } from "react";
import { type AccountState, loadAccount, useAccount } from "../../data/account";
import { useHost } from "../../data/host";
import { pendingOAuth } from "../../data/oauth";
import { useData } from "../../data/provider";
import { SharedTrace } from "../../pages/shared/SharedTrace";
import { type Route, useRoute } from "../../routes";
import { AuthScreen, SetupScreen } from "./AuthScreen";
import { InviteScreen } from "./InviteScreen";
import { NoOrgScreen } from "./NoOrgScreen";
import { isOAuthPage, OAuthScreen } from "./OAuthScreens";
import { DeleteAccount, VerifyEmail } from "./LinkScreens";
import { ForgotPassword, ResetPassword } from "./PasswordScreens";
import { TwoFactorScreen } from "./TwoFactorScreen";

const Splash = () => (
  <div className="wl-auth">
    <p className="wl-muted">Loading WizeLens…</p>
  </div>
);

/** Account screens that open signed in or not: links from emails, setup, and the second sign-in step. Null: not one of them. */
function accountScreen(route: Route, account: AccountState): ReactNode {
  const token = route.query.get("token") ?? "";
  switch (route.page) {
    case "setup":
      return account.needsSetup ? <SetupScreen token={token} state={account} /> : null;
    case "two-factor":
      return account.signedIn ? null : <TwoFactorScreen />;
    case "forgot-password":
      return <ForgotPassword state={account} />;
    case "reset-password":
      return <ResetPassword token={token} />;
    case "verify-email":
      return <VerifyEmail token={token} />;
    case "invite":
      return <InviteScreen id={token} state={account} />;
    case "delete-account":
      return <DeleteAccount token={token} state={account} deleted={route.query.has("done")} />;
    case "oauth":
    case "oauth-consent":
      return <OAuthScreen route={route} state={account} />;
    default:
      return null;
  }
}

/** Shared links open for anyone. On hosts with accounts, everything else needs sign-in first. */
export function AuthGate({ children }: { children: ReactNode }) {
  const route = useRoute();
  const data = useData();
  const host = useHost();
  const account = useAccount();
  const accounts = host.has("accounts");
  useEffect(() => {
    if (accounts) void loadAccount().catch(() => undefined);
  }, [accounts]);
  // Signed in on any other page: an app's sign-in that was left half done stops riding on later sign-ins.
  const signedIn = !!account?.signedIn;
  useEffect(() => {
    if (signedIn && !isOAuthPage(route.page) && route.page !== "two-factor") pendingOAuth.set(null);
  }, [signedIn, route.page]);
  if (route.page === "shared") return <SharedTrace token={route.params[0] ?? ""} />;
  if (!data.info && data.loading) return <Splash />;
  if (!accounts) return <>{children}</>;
  if (!account) return <Splash />;
  const screen = accountScreen(route, account);
  if (screen) return <>{screen}</>;
  if (!account.signedIn) return <AuthScreen state={account} />;
  if (!account.orgs?.length && route.page !== "account") return <NoOrgScreen state={account} />;
  return <>{children}</>;
}
