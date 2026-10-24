import { Radio } from "lucide-react";
import type { StreamStats } from "@wizeworks/lens-core";
import { fmtCount, fmtMs } from "../format";
import { StatCard } from "./StatCard";

/** Streams served (server-sent events, MCP, upgrades) and how long they stayed open; their open time is not in latency. */
export function StreamsCard({ streams, compareLabel }: { streams: StreamStats | null; compareLabel: string }) {
  if (!streams) return null;
  const note = `open ${fmtMs(streams.avgOpenMs)} avg, ${fmtMs(streams.p95OpenMs)} p95`;
  return <StatCard icon={Radio} label="Streams" value={fmtCount(streams.count)} change={null} upIsGood compareLabel={compareLabel} note={note} />;
}
