import { usePageModel } from "../../data/models";
import { useHost } from "../../data/host";
import { hrefTo } from "../../routes";
import { PageHeader } from "../../ui/Panel";
import { ModelState } from "../../ui/ModelState";
import { ActivityPanel } from "./ActivityPanel";
import { FreshErrorsPanel } from "./FreshErrorsPanel";
import { LatestInsights } from "./LatestInsights";
import { OverviewCards } from "./OverviewCards";
import { RecentRequestsPanel } from "./RecentRequestsPanel";
import { ServicesPanel } from "./ServicesPanel";
import { TimingPanel } from "./TimingPanel";
import "../../styles/pages/overview.css";

/** On the cloud, an empty range says so first and points to the setup steps: a new account has nothing yet. */
function NothingYet() {
  if (!useHost().has("accounts")) return null;
  return (
    <div className="wl-banner wl-banner-info">
      Nothing has arrived in this range. New here? Make a key and add it to your site or service: <a href={hrefTo("connect", ["setup"])}>Setup steps</a>.
    </div>
  );
}

export function OverviewPage() {
  const { model, loading, error } = usePageModel("overview");
  return (
    <>
      <PageHeader title="Overview" subtitle="Recent request-level diagnostics across your stack." />
      <ModelState model={model} loading={loading} error={error} what="traces" />
      {model && (
        <>
          {model.empty && <NothingYet />}
          <OverviewCards m={model} />
          <div className="wl-grid wl-ov-top">
            <ActivityPanel m={model} />
            <TimingPanel m={model} />
          </div>
          <div className="wl-grid wl-ov-mid">
            <ServicesPanel rows={model.services} range={model.meta.custom ? null : model.meta.range} />
            <RecentRequestsPanel rows={model.recent} />
          </div>
          <FreshErrorsPanel rows={model.freshErrors} />
          <LatestInsights groups={model.insights} />
        </>
      )}
    </>
  );
}
