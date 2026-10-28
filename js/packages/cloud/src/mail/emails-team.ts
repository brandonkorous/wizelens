import { clockIn } from "./clock.js";
import { type EmailContent, list, text } from "./content.js";

const clock = (ms: number, timeZone?: string) => clockIn(ms, timeZone);

/** Changes in one organization since the last notice, for its owners and admins. */
export function teamChanges(org: string, changes: { text: string; timeMs: number }[], url: string, stop: string, timeZone?: string): EmailContent {
  const one = changes.length === 1;
  return {
    kind: "team",
    subject: one ? `${org}: ${changes[0]!.text}` : `${changes.length} changes in ${org} on WizeLens`,
    preview: changes[0]!.text,
    heading: `Changes in ${org}.`,
    tone: "neutral",
    blocks: [list(one ? "What changed" : `${changes.length} changes`, changes.map((c) => ({ text: c.text, meta: clock(c.timeMs, timeZone) })))],
    action: { label: "Open the audit log", url },
    footer: `You get this because you are an owner or admin of ${org}.`,
    unsubscribe: { label: "Stop team change emails", url: stop },
  };
}

/** A member's own role changed. */
export function roleChanged(org: string, role: string, url: string, stop: string): EmailContent {
  return {
    kind: "team",
    subject: `Your role in ${org} is now ${role}`,
    preview: `You are now ${role} in ${org}.`,
    heading: `You are now ${role}.`,
    tone: "neutral",
    blocks: [text(`Your role in ${org} on WizeLens changed to ${role}. What you can see and change follows the new role.`)],
    action: { label: `Open ${org}`, url },
    footer: `You get this because you are a member of ${org}.`,
    unsubscribe: { label: "Stop team change emails", url: stop },
  };
}

/** An organization and all its data are gone. Sent to every member, always. */
export function orgDeleted(org: string, by: string, url: string): EmailContent {
  return {
    kind: "team",
    subject: `${org} was deleted on WizeLens`,
    preview: `${by} deleted ${org} and all its data.`,
    heading: `${org} was deleted.`,
    tone: "bad",
    blocks: [text(`${by} deleted ${org} on WizeLens. Its projects, traces, keys, and alerts are gone. This cannot be undone.`)],
    action: { label: "Open WizeLens", url },
    footer: `You get this because you were a member of ${org}.`,
  };
}
