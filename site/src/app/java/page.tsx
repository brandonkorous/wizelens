import { JAVA } from "@/sections/stacks/data/java";
import { StackRoute, stackMetadata } from "@/sections/stacks/route";

export const metadata = stackMetadata(JAVA);

export default function Page() {
  return <StackRoute stack={JAVA} />;
}
