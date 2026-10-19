import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, faq, graph } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";
import { PRICING_FAQS } from "@/sections/pricing/faqs";
import { Pricing } from "@/sections/pricing/Pricing";

export const metadata = pageMeta({
  path: "/pricing/",
  title: "WizeLens Cloud pricing: pay for data, not people",
  absolute: true,
  description: "Free with 10 GB a month, Team $29, Business $99, Enterprise custom. Unlimited users and MCP on every plan, and free forever to self-host.",
  image: "pricing",
  imageAlt: "WizeLens Cloud pricing. Pay for data, not people. Free $0, Team $29, Business $99, Enterprise custom.",
});

export default function Page() {
  return (
    <>
      <JsonLd data={graph(breadcrumbs([{ name: "WizeLens", path: "/" }, { name: "Pricing", path: "/pricing/" }]), faq(PRICING_FAQS))} />
      <Pricing />
    </>
  );
}
