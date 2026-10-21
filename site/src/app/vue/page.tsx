import { VUE } from "@/sections/stacks/data/vue";
import { StackRoute, stackMetadata } from "@/sections/stacks/route";

export const metadata = stackMetadata(VUE);

export default function Page() {
  return <StackRoute stack={VUE} />;
}
