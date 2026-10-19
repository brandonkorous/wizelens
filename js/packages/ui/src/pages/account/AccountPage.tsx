import { Bell, Laptop, Plug, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useAccount } from "../../data/account";
import { useRoute } from "../../routes";
import { EmailBanner } from "../../shell/EmailBanner";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { type Section, SectionHead, SectionLayout } from "../../ui/Sections";
import { AppsPanel } from "./AppsPanel";
import { DeletePanel } from "./DeletePanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { PasskeysPanel } from "./PasskeysPanel";
import { PasswordPanel } from "./PasswordPanel";
import { ProfilePanel } from "./ProfilePanel";
import { SessionsPanel } from "./SessionsPanel";
import { TwoFactorPanel } from "./TwoFactorPanel";

/** The signed-in person, one section at a time: profile, sign-in security, devices, connected apps, emails, and deleting the account. */
export function AccountPage() {
  const account = useAccount();
  const { params } = useRoute();
  const user = account?.user;
  if (!account || !user) return <Panel><Empty title="Not signed in" /></Panel>;
  const sections: Section[] = [
    { id: "profile", label: "Profile", icon: UserRound, render: () => <><SectionHead title="Profile" description="Your name and email, as your team sees them." /><ProfilePanel account={account} user={user} /></> },
    {
      id: "security",
      label: "Sign-in and security",
      icon: ShieldCheck,
      render: () => (
        <>
          <SectionHead title="Sign-in and security" description="Your password, a second step at sign-in, and passkeys. We email you when any of these change." />
          <PasswordPanel />
          <TwoFactorPanel user={user} />
          <PasskeysPanel />
        </>
      ),
    },
    { id: "devices", label: "Devices", icon: Laptop, render: () => <><SectionHead title="Devices" description="Where you are signed in now. Sign out of any you do not know." /><SessionsPanel sessionId={account.sessionId} /></> },
    {
      id: "apps",
      label: "Connected apps",
      icon: Plug,
      render: () => <><SectionHead title="Connected apps" description="AI apps such as Claude that read your data with your sign-in, read-only, for the projects you picked." /><AppsPanel list="./api/me/apps" /></>,
    },
    { id: "emails", label: "Emails", icon: Bell, render: () => <><SectionHead title="Emails" description="What WizeLens emails you, and when digests arrive." /><NotificationsPanel /></> },
    { id: "delete", label: "Delete account", icon: Trash2, render: () => <><SectionHead title="Delete account" /><DeletePanel account={account} /></> },
  ];
  return (
    <>
      <PageHeader title="Account" subtitle={`${user.name} · ${user.email}`} />
      <EmailBanner thin={false} />
      <SectionLayout page="account" sections={sections} active={params[0]} />
    </>
  );
}
