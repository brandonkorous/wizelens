import { BookOpen, Bot, KeyRound, ListChecks, Server } from "lucide-react";
import { useData } from "../../data/hooks";
import { useHost } from "../../data/host";
import { useRoute } from "../../routes";
import { PageHeader } from "../../ui/Panel";
import { type Section, SectionHead, SectionLayout } from "../../ui/Sections";
import { type OrgCtx, useOrg } from "../organization/useOrg";
import { keysVisible, ReadKeysSection, SendingKeysSection } from "./KeySections";
import { OptionsReference } from "./OptionsReference";
import { serverText, ServerSetup } from "./ServerSetup";
import { SetupSteps } from "./SetupSteps";
import "../../styles/pages/settings.css";

const SUBTITLE: Record<string, string> = {
  cloud: "Send data from your services, and let AI tools read it.",
  hub: "Send data from your services to this hub.",
  "in-app": "How WizeLens is set up in this service, and where it sends.",
};

function sectionsOf(info: ReturnType<typeof useData>["info"], ctx: OrgCtx | null): Section[] {
  const mode = info?.mode;
  const steps = mode === "hub" || mode === "cloud" || !!info?.hub;
  const list: (Section | false)[] = [
    steps && { id: "setup", label: mode === "in-app" ? "Sends to" : "Setup steps", icon: ListChecks, render: () => <SetupSteps info={info} ctx={ctx} /> },
    { id: "server", label: serverText(mode).label, icon: Server, render: () => <ServerSetup /> },
    keysVisible(ctx) && { id: "keys", label: "Sending keys", icon: KeyRound, count: ctx.data.keys.filter((k) => k.kind !== "read").length, render: () => <SendingKeysSection ctx={ctx} /> },
    keysVisible(ctx) && { id: "read-keys", label: "AI read keys", icon: Bot, count: ctx.data.keys.filter((k) => k.kind === "read").length, render: () => <ReadKeysSection ctx={ctx} /> },
    {
      id: "options",
      label: "Add-on options",
      icon: BookOpen,
      render: () => <><SectionHead title="Add-on options" description="Every option of the .NET and Node add-ons, and the environment variable that sets it without a code change." /><OptionsReference /></>,
    },
  ];
  return list.filter((s): s is Section => !!s);
}

/** Getting data in: the setup steps, how the host is set up, the keys that send and read, and every add-on option. */
export function ConnectPage() {
  const data = useData();
  const { params } = useRoute();
  const org = useOrg(useHost().has("accounts"));
  return (
    <>
      <PageHeader title="Connect" subtitle={SUBTITLE[data.info?.mode ?? "in-app"] ?? ""} />
      {org.error && <div className="wl-banner wl-banner-error">{org.error}</div>}
      <SectionLayout page="connect" sections={sectionsOf(data.info, org.ctx)} active={params[0]} />
    </>
  );
}
