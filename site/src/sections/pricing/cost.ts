import { monthlyPrice, plan } from "./plans";

// Year-one cost for a 40-developer company sending about 2.5 TB a month. Setup and staff are estimates.
export const VOLUME_GB = 2500;

export type Part = { kind: "license" | "setup" | "staff" | "total" | "range"; value: number; label: string };
export type Vendor = { name: string; total: string; parts: Part[]; note: string };

const wizelens = Math.round(monthlyPrice(plan("business"), VOLUME_GB) * 12);

export const VENDORS: Vendor[] = [
  {
    name: "Datadog",
    total: "~$231K",
    note: "License at list price for the same data, plus rollout and the people to run it.",
    parts: [
      { kind: "license", value: 54, label: "License ~$54K" },
      { kind: "setup", value: 127, label: "Setup ~$127K (estimate)" },
      { kind: "staff", value: 50, label: "Staff ~$50K (estimate)" },
    ],
  },
  {
    name: "Dynatrace",
    total: "~$256K to 283K",
    note: "License at rate-card price for the same data, rollout, and upkeep. The whole range is an estimate.",
    parts: [
      { kind: "total", value: 256, label: "All in ~$256K (estimate)" },
      { kind: "range", value: 27, label: "up to ~$283K" },
    ],
  },
  {
    name: "WizeLens Business",
    total: `~$${(wizelens / 1000).toFixed(1)}K`,
    note: "Business plus overage for about 2.5 TB a month, the same volume as the Datadog figure. Two lines of setup per app.",
    parts: [{ kind: "license", value: wizelens / 1000, label: `License ~$${(wizelens / 1000).toFixed(1)}K` }],
  },
];

export const MAX_K = 283;

export const SOURCES = [
  { label: "Datadog pricing list", href: "https://www.datadoghq.com/pricing/list/" },
  { label: "Dynatrace rate card", href: "https://www.dynatrace.com/pricing/rate-card/" },
];
