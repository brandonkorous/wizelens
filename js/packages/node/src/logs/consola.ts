import { addCleanup, logSinkOf } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { errorAttributes, firstError, formatArgs, levelFromName } from "./levels.js";

interface LogObject {
  type?: string;
  tag?: string;
  args?: unknown[];
  message?: string;
  date?: Date;
}
interface Reporter {
  log(logObj: LogObject): void;
}
interface ConsolaLike {
  addReporter(reporter: Reporter): unknown;
  removeReporter?(reporter: Reporter): unknown;
}

/** Copy consola log lines written during a request into its trace. */
export function instrumentConsola(wizelens: WizeLens, consola: unknown): boolean {
  const sink = logSinkOf(wizelens);
  const target = consola as ConsolaLike | null;
  if (!sink || !target || typeof target.addReporter !== "function") return false;
  const reporter: Reporter = {
    log(o) {
      const args = o.args ?? (o.message ? [o.message] : []);
      sink({
        level: o.type === "fatal" ? "critical" : levelFromName(o.type),
        category: o.tag || "consola",
        message: formatArgs(args),
        attributes: errorAttributes(firstError(args)),
        timeMs: o.date instanceof Date ? o.date.getTime() : undefined,
      });
    },
  };
  target.addReporter(reporter);
  addCleanup(wizelens, () => void target.removeReporter?.(reporter));
  return true;
}
