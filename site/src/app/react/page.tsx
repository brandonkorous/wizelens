import type { Metadata } from "next";
import { StackPage } from "@/sections/stacks/StackPage";
import { REACT } from "@/sections/stacks/data/react";

export const metadata: Metadata = { title: { absolute: REACT.title }, description: REACT.lede };

export default function Page() {
  return <StackPage stack={REACT} />;
}
