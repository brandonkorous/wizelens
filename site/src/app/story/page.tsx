import type { Metadata } from "next";
import { Story } from "@/sections/story/Story";

export const metadata: Metadata = {
  title: "Glimpse, rebuilt",
  description: "You used to be able to open the hood on one request and see everything it did. Why we built that back for how we build today.",
};

export default function Page() {
  return <Story />;
}
