import { logSinkOf } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { errorAttributes, firstError, formatArgs, levelFromName } from "./levels.js";

interface LoggingEvent {
  categoryName?: string;
  data?: unknown[];
  level?: { levelStr?: string };
  startTime?: Date;
  context?: Record<string, unknown>;
}

/** A log4js appender module: `appenders: { wizelens: { type: log4jsAppender(wizelens) } }`. */
export function log4jsAppender(wizelens: WizeLens) {
  return {
    configure: () => (event: LoggingEvent) => {
      const sink = logSinkOf(wizelens);
      if (!sink) return;
      const data = event.data ?? [];
      sink({
        level: levelFromName(event.level?.levelStr),
        category: event.categoryName ?? "log4js",
        message: formatArgs(data),
        attributes: { ...event.context, ...errorAttributes(firstError(data)) },
        timeMs: event.startTime instanceof Date ? event.startTime.getTime() : undefined,
      });
    },
  };
}
