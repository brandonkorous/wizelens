import { CheckIcon } from "@/components/ui/icons";
import { GUARDS, TOOLS } from "./script";
import { Transcript } from "./Transcript";

export function AiAccess() {
  return (
    <section className="wl-section wl-night" id="ai">
      <div className="wl-wrap">
        <div className="wl-ai">
          <div className="wl-ai-copy">
            <h2 className="wl-h2">Your AI can look. Only if you let it.</h2>
            <p className="wl-lede">
              There is no AI inside WizeLens. There is a door: a read-only MCP endpoint that your own agent can use to
              read traces, slow queries, N+1 problems, errors, problems, security risks, and a health report for every
              project you allow. You decide if it opens.
            </p>
            <ul className="wl-guards">
              {GUARDS.map((g) => (
                <li key={g.title}>
                  <span className="wl-guard-mark"><CheckIcon /></span>
                  <p><b>{g.title}</b> {g.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <Transcript />
        </div>
        <div className="wl-tools">
          {TOOLS.map((t) => <code key={t}>{t}</code>)}
        </div>
      </div>
    </section>
  );
}
