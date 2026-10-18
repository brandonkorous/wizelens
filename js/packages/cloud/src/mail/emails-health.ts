import { type EmailContent, facts, text } from "./content.js";

const clock = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const span = (ms: number) => (ms >= 86_400_000 ? `${Math.round(ms / 86_400_000)} days` : `${Math.max(1, Math.round(ms / 3_600_000))} hours`);

/** A project that sends data around the clock stopped. */
export function projectQuiet(project: string, org: string, lastMs: number, nowMs: number, url: string, stop: string): EmailContent {
  return {
    kind: "health",
    subject: `${project} stopped sending data to WizeLens`,
    preview: `No data from ${project} for ${span(nowMs - lastMs)}.`,
    heading: `${project} went quiet.`,
    tone: "bad",
    blocks: [
      text(`${project} in ${org} usually sends data every hour. Nothing arrived for ${span(nowMs - lastMs)}.`),
      text("The app may be down, its add-on may have lost its key, or traffic may have stopped."),
      facts([["Last data", clock(lastMs)], ["Quiet for", span(nowMs - lastMs)]]),
    ],
    action: { label: `Open ${project}`, url },
    footer: `You get this because you are an owner or admin of ${org}.`,
    unsubscribe: { label: "Stop project health emails", url: stop },
  };
}

/** Data arrives again after a quiet notice. */
export function projectBack(project: string, org: string, quietMs: number, url: string, stop: string): EmailContent {
  return {
    kind: "health",
    subject: `${project} is sending data to WizeLens again`,
    preview: `Data from ${project} arrives again after ${span(quietMs)}.`,
    heading: `${project} is back.`,
    tone: "good",
    blocks: [text(`Data from ${project} in ${org} arrives again. It was quiet for about ${span(quietMs)}.`)],
    action: { label: `Open ${project}`, url },
    footer: `You get this because you are an owner or admin of ${org}.`,
    unsubscribe: { label: "Stop project health emails", url: stop },
  };
}
