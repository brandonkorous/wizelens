import { PYTHON } from "@/sections/stacks/data/python";
import { StackRoute, stackMetadata } from "@/sections/stacks/route";

export const metadata = stackMetadata(PYTHON);

export default function Page() {
  return <StackRoute stack={PYTHON} />;
}
