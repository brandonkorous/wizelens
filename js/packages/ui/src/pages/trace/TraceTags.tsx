import { useMemo } from "react";
import { endpointScope, serviceScope, type TagScope, type Trace } from "@wizeworks/lens-core/internal";
import { traceRow, useRowTags } from "../../data/tagMatch";
import { TagChips } from "../../ui/TagChips";
import { TagThis } from "../../ui/TagThis";

/** What "Tag this" offers on a trace: its endpoint (when the root is an HTTP request), and its service. */
export function traceScopes(t: Trace): TagScope[] {
  return [...(t.rootMethod ? [endpointScope(t.service, t.rootName)] : []), serviceScope(t.service)];
}

/** The tags of one trace, as the host matches them. */
export function TraceTags({ trace }: { trace: Trace }) {
  const rows = useMemo(() => [trace], [trace]);
  const tagsOf = useRowTags("traces", rows, traceRow);
  return <TagChips tags={tagsOf(trace)} />;
}

export const TagThisTrace = ({ trace }: { trace: Trace }) => <TagThis scopes={traceScopes(trace)} />;
