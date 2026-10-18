import type { Metadata } from "next";
import { Cloud } from "@/sections/cloud/Cloud";

export const metadata: Metadata = {
  title: "WizeLens Cloud",
  description: "The WizeLens dashboard for a whole team: accounts and roles, 30 days of history, alerts, share links, and scoped AI access. Self-host it on Postgres today.",
};

export default function Page() {
  return <Cloud />;
}
