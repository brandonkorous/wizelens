import { ANGULAR } from "@/sections/stacks/data/angular";
import { StackRoute, stackMetadata } from "@/sections/stacks/route";

export const metadata = stackMetadata(ANGULAR);

export default function Page() {
  return <StackRoute stack={ANGULAR} />;
}
