import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, graph } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";
import { Cloud } from "@/sections/cloud/Cloud";

export const metadata = pageMeta({
  path: "/cloud/",
  title: "WizeLens Cloud: request tracing for your team, hosted or self-hosted",
  absolute: true,
  description: "WizeLens for teams: roles, SSO, up to 400 days of history, alerts to Slack, Teams, PagerDuty, and email, uptime checks and status pages, and scoped AI access.",
  image: "cloud",
  imageAlt: "WizeLens Cloud: the same lens, for the team. An alert says the error rate is 3.4%, above 2%. Roles: owner, admin, member, viewer.",
});

export default function Page() {
  return (
    <>
      <JsonLd data={graph(breadcrumbs([{ name: "WizeLens", path: "/" }, { name: "Cloud", path: "/cloud/" }]))} />
      <Cloud />
    </>
  );
}
