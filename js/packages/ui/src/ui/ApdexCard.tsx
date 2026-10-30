import { Smile } from "lucide-react";
import { type Apdex, apdexRating } from "@wizeworks/lens-core/internal";
import { useHost } from "../data/host";
import { hrefTo } from "../routes";
import { StatCard } from "./StatCard";

/** Apdex as a number card: the score, its rating, and the target (or "per-service targets"). Links to the targets. */
export function ApdexCard({ apdex, compareLabel }: { apdex: Apdex | null; compareLabel: string }) {
  const slos = useHost().has("slos");
  const score = apdex?.score ?? null;
  // No-break spaces: a narrow card wraps before "target", never inside "500 ms".
  const target = apdex?.targetMs ? `target ${apdex.targetMs} ms` : "per-service targets";
  const note = score === null ? "No requests" : `${apdexRating(score)} · ${target}`;
  return <StatCard icon={Smile} label="Apdex" value={score === null ? "–" : score.toFixed(2)} change={null} upIsGood compareLabel={compareLabel} note={note} href={slos ? hrefTo("slos") : undefined} />;
}
