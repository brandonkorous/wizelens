import { fmtCount } from "../format";
import { useHost } from "../data/host";
import { hrefTo } from "../routes";

/** What each server screen is missing, after "N page views arrived, and". */
const SAYS = {
  overview: "no server requests. Request, SQL, and Apdex numbers need a WizeLens server SDK.",
  requests: "no requests. Your pages called no API, and no WizeLens server SDK sent requests.",
  sql: "no SQL. Queries come from a WizeLens server SDK in the app that talks to your database.",
  services: "no services. Services and the calls between them come from WizeLens server SDKs.",
};

/** A site that sends page views and no server data: why a server screen is empty, and where its data is. */
export function PagesOnly({ views, what }: { views: number; what: keyof typeof SAYS }) {
  const cloud = useHost().has("accounts");
  if (views <= 0) return null;
  return (
    <div className="wl-banner wl-banner-info">
      {fmtCount(views)} page {views === 1 ? "view" : "views"} arrived, and {SAYS[what]}
      {cloud && <> To add one: <a href={hrefTo("connect", ["setup"])}>Setup steps</a>.</>} See your pages and their load times under{" "}
      <a href={hrefTo("rendering")}>Rendering</a>.
    </div>
  );
}
