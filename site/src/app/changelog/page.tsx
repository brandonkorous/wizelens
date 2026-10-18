import type { Metadata } from "next";
import { Changelog } from "@/sections/changelog/Changelog";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Every change to WizeLens, newest first: the in-app add-on, the local hub, the cloud, and what is on main now.",
};

export default function Page() {
  return <Changelog />;
}
