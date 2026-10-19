import { ATTR_ERROR_FRAME, ATTR_SERVICE_VERSION } from "../attributes.js";
import type { Span, SpanEvent } from "../types.js";
import { groupFrameOf, type MapLoader, resolveStack } from "./resolve.js";

/** Most time one batch waits for maps before it is stored as it is. */
const ANNOTATE_MS = 5000;

const exceptionOf = (span: Span): SpanEvent | undefined => span.events.find((e) => e.name === "exception");

/** The release a browser span names, or null. */
export function releaseOf(span: Span): string | null {
  const v = span.attributes[ATTR_SERVICE_VERSION];
  return typeof v === "string" && v ? v : null;
}

/** Browser exceptions with a stack and no group frame yet. */
function needsFrame(span: Span): SpanEvent | null {
  if (span.category !== "browser") return null;
  const ex = exceptionOf(span);
  if (!ex || ex.attributes[ATTR_ERROR_FRAME] != null) return null;
  return typeof ex.attributes["exception.stacktrace"] === "string" ? ex : null;
}

/** The group frame of one stack, or null when no map covers an app frame. */
export async function groupFrameOfStack(stack: string, release: string | null, load: MapLoader): Promise<string | null> {
  return groupFrameOf(await resolveStack(stack, release, load, { context: 0, maxFrames: 20 }));
}

/** Add the group frame to browser exceptions, so they group by original source. Changes the spans in place; never throws. */
export async function annotateErrorFrames(spans: readonly Span[], load: MapLoader, timeoutMs = ANNOTATE_MS): Promise<void> {
  const work = spans.flatMap((span) => {
    const ex = needsFrame(span);
    if (!ex) return [];
    return [
      groupFrameOfStack(String(ex.attributes["exception.stacktrace"]), releaseOf(span), load)
        .then((frame) => void (frame && (ex.attributes[ATTR_ERROR_FRAME] = frame)))
        .catch(() => undefined),
    ];
  });
  if (work.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)));
  await Promise.race([Promise.all(work), late]);
  clearTimeout(timer);
}
