import { NODE } from "@/sections/stacks/data/node";
import { StackRoute, stackMetadata } from "@/sections/stacks/route";

export const metadata = stackMetadata(NODE);

export default function Page() {
  return <StackRoute stack={NODE} />;
}
