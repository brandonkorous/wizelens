import { type ReactNode, useEffect } from "react";
import { loadAccount, useAccount } from "../../data/account";
import { useHost } from "../../data/host";
import { useData } from "../../data/provider";
import { SharedTrace } from "../../pages/shared/SharedTrace";
import { useRoute } from "../../routes";
import { AuthScreen } from "./AuthScreen";
import { JoinScreen } from "./JoinScreen";

const Splash = () => (
  <div className="wl-auth">
    <p className="wl-muted">Loading WizeLens…</p>
  </div>
);

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
  if (route.page === "shared") return <SharedTrace token={route.params[0] ?? ""} />;
  if (!data.info && data.loading) return <Splash />;
  if (!accounts) return <>{children}</>;
  if (!account) return <Splash />;
  if (route.page === "join") return <JoinScreen token={route.params[0] ?? ""} state={account} />;
  if (!account.signedIn) return <AuthScreen state={account} />;
  return <>{children}</>;
}
