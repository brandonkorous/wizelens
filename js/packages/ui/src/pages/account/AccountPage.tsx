import { useAccount } from "../../data/account";
import { EmailBanner } from "../../shell/EmailBanner";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { DeletePanel } from "./DeletePanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { PasskeysPanel } from "./PasskeysPanel";
import { PasswordPanel } from "./PasswordPanel";
import { ProfilePanel } from "./ProfilePanel";
import { SessionsPanel } from "./SessionsPanel";
import { TwoFactorPanel } from "./TwoFactorPanel";

/** The signed-in person: profile, password, two-step sign-in, passkeys, devices, emails, and deleting the account. */
export function AccountPage() {
  const account = useAccount();
  const user = account?.user;
  if (!account || !user) return <Panel><Empty title="Not signed in" /></Panel>;
  return (
    <>
      <PageHeader title="Account" subtitle={`${user.name} · ${user.email}`} />
      <EmailBanner thin={false} />
      <ProfilePanel account={account} user={user} />
      <PasswordPanel />
      <TwoFactorPanel user={user} />
      <PasskeysPanel />
      <SessionsPanel sessionId={account.sessionId} />
      <NotificationsPanel />
      <DeletePanel account={account} />
    </>
  );
}
