import type { Faq } from "@/sections/faq/faqs";

// Pricing questions. The same text feeds the page and its structured data.
export const PRICING_FAQS: Faq[] = [
  {
    q: "What counts as a GB?",
    a: "The data your apps send to the cloud, as it arrives: the body of each ingest call and each OpenTelemetry (OTLP) call, still compressed. A GB is 1,000,000,000 bytes. Sampling and compression both make it smaller. Reading, searching, alerts, and MCP calls never count.",
  },
  {
    q: "What happens at the Free plan's 10 GB?",
    a: "The cloud stops taking new data for the rest of the month and answers HTTP 429 until the 1st (UTC), or until you upgrade. Your apps keep running: the add-ons and OpenTelemetry exporters back off on 429. What you already sent stays readable. Owners and admins get an email at 80% and at 100%.",
  },
  {
    q: "Can I cap what I spend?",
    a: "Yes. On Team and Business, an owner can set a monthly limit for extra data, in dollars. Past it, the cloud answers 429 like the Free cap until the 1st, so extra data never costs more than your limit.",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes. Cancel under Manage billing in the app. The plan runs to the end of the period you paid for, then the organization moves to Free and keeps 14 days of history.",
  },
  {
    q: "Is self-hosting really free?",
    a: "Yes, forever. The add-ons and the hub are MIT licensed, and you can run the cloud yourself on your own Postgres. Billing is off unless the cloud starts with Stripe keys, so a self-hosted cloud has no plans, no caps, and no prompts.",
  },
  {
    q: "Do you charge per user or for AI access?",
    a: "No. Every plan has unlimited users and MCP access for Claude and other agents. You pay for data and history, nothing else.",
  },
  {
    q: "Is there a discount for paying yearly?",
    a: "Yes. Pay yearly and you get 12 months for the price of 10: Team is $290 a year and Business is $990 a year. Extra data is billed each month.",
  },
];
