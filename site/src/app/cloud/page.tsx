import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, graph } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";
import { Cloud } from "@/sections/cloud/Cloud";

export const metadata = pageMeta({
  path: "/cloud/",
  title: "WizeLens Cloud: request tracing for your whole team, self-hosted",
  absolute: true,
  description: "WizeLens for teams: roles, 30 days of history, alerts to Slack and webhooks, share links, and AI access you scope by project. Self-host it on Postgres.",
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
