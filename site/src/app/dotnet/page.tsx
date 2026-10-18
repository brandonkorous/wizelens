import type { Metadata } from "next";
import { StackPage } from "@/sections/stacks/StackPage";
import { DOTNET } from "@/sections/stacks/data/dotnet";

export const metadata: Metadata = { title: { absolute: DOTNET.title }, description: DOTNET.lede };

export default function Page() {
  return <StackPage stack={DOTNET} />;
}
