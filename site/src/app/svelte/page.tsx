import { SVELTE } from "@/sections/stacks/data/svelte";
import { StackRoute, stackMetadata } from "@/sections/stacks/route";

export const metadata = stackMetadata(SVELTE);

export default function Page() {
  return <StackRoute stack={SVELTE} />;
}
