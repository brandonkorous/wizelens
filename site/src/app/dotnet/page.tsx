import { DOTNET } from "@/sections/stacks/data/dotnet";
import { StackRoute, stackMetadata } from "@/sections/stacks/route";

export const metadata = stackMetadata(DOTNET);

export default function Page() {
  return <StackRoute stack={DOTNET} />;
}
