import { type EmailContent, facts, text } from "./content.js";

const gb = (n: number) => `${n >= 100 ? Math.round(n) : Math.round(n * 10) / 10} GB`;
const footer = (org: string) => `You get this because you are an owner or admin of ${org}.`;

export interface UsageNotice {
  org: string;
  plan: string;
  usedGb: number;
  includedGb: number;
  /** 80 or 100. */
  percent: number;
  /** Team and Business keep taking data past the included GB, at extra cost. */
  overage: boolean;
  url: string;
}

function whatNext(n: UsageNotice): string {
  if (n.percent < 100) return n.overage ? "Past the included GB, data keeps coming in and each extra GB is billed." : "At 100%, data stops until the 1st (UTC). Upgrade to keep it coming.";
  return n.overage ? "Data keeps coming in. Each extra GB is billed at the end of the month." : "New data is refused until the 1st (UTC). Upgrade to accept it again now.";
}

/** 80% or 100% of the plan's included GB this month. */
export function usageNotice(n: UsageNotice): EmailContent {
  const full = n.percent >= 100;
  return {
    kind: "billing",
    subject: `${n.org} used ${n.percent}% of its WizeLens data for this month`,
    preview: `${gb(n.usedGb)} of ${gb(n.includedGb)} on the ${n.plan} plan.`,
    heading: full ? `${n.org} used all of this month's data.` : `${n.org} used ${n.percent}% of this month's data.`,
    tone: full && !n.overage ? "bad" : "warn",
    blocks: [text(whatNext(n)), facts([["Plan", n.plan], ["Used this month", gb(n.usedGb)], ["Included", gb(n.includedGb)]])],
    action: { label: full && !n.overage ? "Upgrade" : "Open Billing", url: n.url },
    footer: footer(n.org),
  };
}

/** The spend cap stopped ingest. */
export function spendCapReached(org: string, capUsd: number, url: string): EmailContent {
  return {
    kind: "billing",
    subject: `${org} reached its WizeLens spend cap`,
    preview: `Extra data reached the $${capUsd} cap, so new data is refused until the 1st.`,
    heading: `${org} reached its spend cap.`,
    tone: "bad",
    blocks: [text(`Extra data this month reached the cap of $${capUsd} an owner set. New data is refused until the 1st (UTC), or until an owner raises the cap.`)],
    action: { label: "Open Billing", url },
    footer: footer(org),
  };
}
