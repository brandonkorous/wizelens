import { useData } from "../../data/hooks";
import { hrefTo } from "../../routes";
import { Empty, Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";
import { SourceSettings } from "./SourceSettings";

/** What each host calls this section, and where its settings are changed. */
export function serverText(mode: string | undefined): { label: string; description: string } {
  if (mode === "cloud") return { label: "Server setup", description: "How this WizeLens Cloud is set up. Start options change it: run wizelens-cloud --help." };
  if (mode === "hub") return { label: "Server setup", description: "How this hub is set up. Start options change it: run wizelens-hub --help." };
  return { label: "This service", description: "How WizeLens is set up in each service this dashboard reads. Settings live in each app's code: change one, then restart the service." };
}

/** The host's own setup: version, storage, how long it keeps data, sampling, and AI access, for each service it reads. */
export function ServerSetup() {
  const data = useData();
  const mode = data.info?.mode;
  const text = serverText(mode);
  const where = mode === "cloud" ? "organization" : "settings";
  return (
    <>
      <SectionHead title={text.label} description={text.description} />
      {mode !== "in-app" && (
        <p className="wl-muted wl-settings-note">
          Each project changes its own thresholds and hidden keys under <a href={hrefTo(where, ["checks"])}>Thresholds and hidden keys</a>.
        </p>
      )}
      {data.sources.length === 0 ? (
        <Panel><Empty title="No services connected yet" /></Panel>
      ) : (
        <div className="wl-settings-sources">{data.sources.map((s) => <SourceSettings key={s.endpoint} source={s} />)}</div>
      )}
    </>
  );
}
