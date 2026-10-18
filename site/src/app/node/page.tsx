import type { Metadata } from "next";
import { StackPage } from "@/sections/stacks/StackPage";
import { NODE } from "@/sections/stacks/data/node";

export const metadata: Metadata = { title: { absolute: NODE.title }, description: NODE.lede };

export default function Page() {
  return <StackPage stack={NODE} />;
}
