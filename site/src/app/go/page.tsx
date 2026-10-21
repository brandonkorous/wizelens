import { GO } from "@/sections/stacks/data/go";
import { StackRoute, stackMetadata } from "@/sections/stacks/route";

export const metadata = stackMetadata(GO);

export default function Page() {
  return <StackRoute stack={GO} />;
}
