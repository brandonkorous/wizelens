import type { IncomingMessage } from "node:http";

/** What an upgrade answered on its socket: the status line and when it was written. */
export interface UpgradeTap {
  status: () => number | undefined;
  firstAt: () => number | undefined;
}

const NONE: UpgradeTap = { status: () => undefined, firstAt: () => undefined };
const STATUS_LINE = /^HTTP\/1\.[01] (\d{3})/;

/** An upgrade routed through the app (`@fastify/websocket`) answers on the raw socket: reads that first write, then steps aside. */
export function tapUpgrade(req: IncomingMessage): UpgradeTap {
  const socket = req.socket;
  if (!req.headers.upgrade || !socket) return NONE;
  let status: number | undefined;
  let firstAt: number | undefined;
  const write = socket.write;
  socket.write = function (this: typeof socket, chunk: unknown, ...rest: unknown[]): boolean {
    socket.write = write;
    const line = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("latin1", 0, 16) : "";
    const m = STATUS_LINE.exec(line);
    if (m) {
      status = Number(m[1]);
      firstAt = performance.now();
    }
    return (write as (...a: unknown[]) => boolean).apply(this, [chunk, ...rest]);
  } as typeof socket.write;
  return { status: () => status, firstAt: () => firstAt };
}
