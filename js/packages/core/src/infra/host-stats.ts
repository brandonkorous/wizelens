// One host's numbers from its hostmetrics series: CPU, memory, disks, and network.
import { HOST } from "./names.js";
import { attrOf, avgOf, directionOf, type Line, lastOf, lineOf, mergeLines, named, rateOf, type Series, stateOf, sumOf } from "./series.js";

export interface FileSystemRow {
  mount: string;
  device: string;
  type: string;
  used: number | null;
  total: number | null;
  /** Used share of what can be used (used / (used + free)), like `df`. */
  share: number | null;
}

export interface HostNumbers {
  /** Busy share of all CPUs, 0 to 1. */
  cpu: number | null;
  cores: number | null;
  load1: number | null;
  memUsed: number | null;
  memTotal: number | null;
  mem: number | null;
  diskUsed: number | null;
  diskTotal: number | null;
  /** The fullest file system's used share. */
  disk: number | null;
  diskRead: number | null;
  diskWrite: number | null;
  netIn: number | null;
  netOut: number | null;
}

const IDLE = "idle";
const cpuOf = (s: Series) => attrOf(s, "cpu", "cpu.logical_number");
const notSlab = (s: Series) => !stateOf(s).startsWith("slab");
const notLoopback = (s: Series) => attrOf(s, "device", "network.interface.name") !== "lo";
const byDirection = (list: readonly Series[], dir: string) => list.filter((s) => directionOf(s) === dir);

/** Busy share: 1 minus the average idle share per CPU (utilization), or idle time over all time (cpu.time). */
function cpuNow(list: readonly Series[]): number | null {
  const util = named(list, HOST.cpuUtil);
  if (util.length > 0) {
    const idle = avgOf(util.filter((s) => stateOf(s) === IDLE).map(lastOf));
    return idle === null ? null : Math.max(0, 1 - idle);
  }
  const time = named(list, HOST.cpuTime);
  const all = sumOf(time.map(rateOf));
  const idle = sumOf(time.filter((s) => stateOf(s) === IDLE).map(rateOf)) ?? 0;
  return all && all > 0 ? Math.max(0, 1 - idle / all) : null;
}

/** CPU busy share per bucket. */
export function cpuLine(list: readonly Series[]): Line {
  const util = named(list, HOST.cpuUtil);
  if (util.length > 0) return mergeLines(util.filter((s) => stateOf(s) === IDLE).map(lineOf), avgOf).map((v) => (v === null ? null : Math.max(0, 1 - v)));
  const time = named(list, HOST.cpuTime);
  const all = mergeLines(time.map(lineOf));
  const idle = mergeLines(time.filter((s) => stateOf(s) === IDLE).map(lineOf));
  return all.map((a, i) => (a && a > 0 ? Math.max(0, 1 - (idle[i] ?? 0) / a) : null));
}

/** Used memory per bucket, in bytes. */
export const memLine = (list: readonly Series[]): Line => mergeLines(named(list, HOST.memUsage).filter((s) => stateOf(s) === "used").map(lineOf));

/** Bytes per second per bucket for one direction of a counter (disk reads, network receives). */
export const ioLine = (list: readonly Series[], name: string, dir: string): Line => mergeLines(byDirection(named(list, name).filter(notLoopback), dir).map(lineOf));

/** File systems by mount point, fullest first. */
export function fileSystemsOf(list: readonly Series[]): FileSystemRow[] {
  const mounts = new Map<string, Series[]>();
  for (const s of named(list, HOST.fsUsage)) {
    const m = attrOf(s, "mountpoint", "system.filesystem.mountpoint");
    mounts.set(m, [...(mounts.get(m) ?? []), s]);
  }
  const rows = [...mounts].map(([mount, ss]) => {
    const at = (state: string) => sumOf(ss.filter((s) => stateOf(s) === state).map(lastOf));
    const [used, free, reserved] = [at("used"), at("free"), at("reserved")];
    const total = sumOf([used, free, reserved]);
    const room = (used ?? 0) + (free ?? 0);
    return { mount, device: attrOf(ss[0]!, "device", "system.device"), type: attrOf(ss[0]!, "type", "system.filesystem.type"), used, total, share: room > 0 ? (used ?? 0) / room : null };
  });
  // One row per device: bind mounts of the same disk (common in containers) keep the shortest mount point.
  const byDevice = new Map<string, FileSystemRow>();
  for (const r of rows.sort((a, b) => a.mount.length - b.mount.length || a.mount.localeCompare(b.mount))) if (!byDevice.has(r.device || r.mount)) byDevice.set(r.device || r.mount, r);
  return [...byDevice.values()].sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || a.mount.localeCompare(b.mount));
}

function memNow(list: readonly Series[]) {
  const usage = named(list, HOST.memUsage).filter(notSlab);
  const memUsed = sumOf(usage.filter((s) => stateOf(s) === "used").map(lastOf));
  const memTotal = sumOf(usage.map(lastOf));
  const util = sumOf(named(list, HOST.memUtil).filter((s) => stateOf(s) === "used").map(lastOf));
  return { memUsed, memTotal, mem: util ?? (memUsed !== null && memTotal ? memUsed / memTotal : null) };
}

function diskNow(list: readonly Series[]) {
  const fs = fileSystemsOf(list);
  const devices = new Map(fs.map((f) => [f.device || f.mount, f]));
  return { diskUsed: sumOf([...devices.values()].map((f) => f.used)), diskTotal: sumOf([...devices.values()].map((f) => f.total)), disk: fs[0]?.share ?? null };
}

const ioNow = (list: readonly Series[], name: string, dir: string) => sumOf(byDirection(named(list, name).filter(notLoopback), dir).map(rateOf));

/** A host's numbers from its series. */
export function hostNumbers(list: readonly Series[]): HostNumbers {
  const cores = sumOf(named(list, HOST.cpuCount).map(lastOf)) ?? (new Set(named(list, [HOST.cpuUtil, HOST.cpuTime]).map(cpuOf)).size || null);
  return {
    cpu: cpuNow(list),
    cores,
    load1: avgOf(named(list, HOST.load1).map(lastOf)),
    ...memNow(list),
    ...diskNow(list),
    diskRead: ioNow(list, HOST.diskIo, "read"),
    diskWrite: ioNow(list, HOST.diskIo, "write"),
    netIn: ioNow(list, HOST.netIo, "receive"),
    netOut: ioNow(list, HOST.netIo, "transmit"),
  };
}
