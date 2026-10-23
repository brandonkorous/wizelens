import { type ReactNode, useState } from "react";
import { hrefTo } from "../../routes";
import { CopyButton } from "../../ui/Badges";
import { AddButton, ImportButton, SectionHead } from "../../ui/Sections";
import { ImportProjectsForm } from "../organization/ImportProjects";
import { canManage } from "../organization/orgTypes";
import type { OrgCtx } from "../organization/useOrg";
import { KeyForm, type Kind, READING, SENDING } from "./KeyForm";
import { KeysPanel } from "./KeysPanel";

interface KeysOfProps {
  ctx: OrgCtx;
  kinds: readonly Kind[];
  title: string;
  description: ReactNode;
  newLabel: string;
  /** Sending keys also import many projects, each with a key, from a file. */
  importable?: boolean;
}

/** One list of keys with its own "new key" form. Only owners and admins see keys. */
function KeysOf({ ctx, kinds, title, description, newLabel, importable = false }: KeysOfProps) {
  const [open, setOpen] = useState<"new" | "import" | null>(null);
  const { org, data, reload } = ctx;
  const actions = (
    <>
      {importable && <ImportButton label="Import projects from a file" onOpen={() => setOpen("import")} />}
      <AddButton label={newLabel} onOpen={() => setOpen("new")} />
    </>
  );
  return (
    <>
      <SectionHead title={title} description={description} action={actions} />
      {open === "new" && <KeyForm orgId={org.id} data={data} kinds={kinds} reload={reload} onClose={() => setOpen(null)} />}
      {open === "import" && <ImportProjectsForm orgId={org.id} data={data} reload={reload} onClose={() => setOpen(null)} />}
      <KeysPanel orgId={org.id} data={data} kinds={kinds} reload={reload} />
    </>
  );
}

/** Ingest keys (apps send with them) and browser keys (sites send with them). */
export function SendingKeysSection({ ctx }: { ctx: OrgCtx }) {
  const description = "Ingest keys let an app send data to one project. Browser keys let a site with no WizeLens server send its page data. Only a hash is kept, so a key is shown once. Many apps? Import a file of projects and get a key for each.";
  return <KeysOf ctx={ctx} kinds={SENDING} title="Sending keys" description={description} newLabel="New sending key" importable />;
}

/** Read keys: AI agents and scripts read the projects they were given, read-only. */
export function ReadKeysSection({ ctx }: { ctx: OrgCtx }) {
  const mcp = `${new URL("../", window.location.href).href.replace(/\/$/, "")}/_wizelens/mcp`;
  const description = (
    <>
      Read keys let an AI agent or a script read the projects you pick, read-only. Send one as Authorization: Bearer &lt;key&gt; to{" "}
      <code className="wl-mono">{mcp}</code> <CopyButton text={mcp} label="Copy the MCP address" />. People who connect an AI app with their own sign-in show under{" "}
      <a href={hrefTo("people", ["apps"])}>Connected apps</a>.
    </>
  );
  return <KeysOf ctx={ctx} kinds={READING} title="AI read keys" description={description} newLabel="New read key" />;
}

/** Keys are for owners and admins; others see why the list is empty. */
export const keysVisible = (ctx: OrgCtx | null): ctx is OrgCtx => !!ctx && canManage(ctx.data.role);
