import { REACT } from "@/sections/stacks/data/react";
import { StackRoute, stackMetadata } from "@/sections/stacks/route";

export const metadata = stackMetadata(REACT);

export default function Page() {
  return <StackRoute stack={REACT} />;
}
