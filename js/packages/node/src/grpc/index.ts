import { captureOf } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { patchGrpcChannel } from "./client.js";
import { patchGrpcServer } from "./server.js";
import type { GrpcModuleLike } from "./shared.js";

/** Trace @grpc/grpc-js calls in and out: `instrumentGrpc(wizelens, grpc)`. Call it before `server.addService`. Returns false when nothing was patched. */
export function instrumentGrpc(wizelens: WizeLens, grpc: unknown): boolean {
  const g = grpc as GrpcModuleLike | null;
  if (!captureOf(wizelens) || !g?.Channel?.prototype || !g.Server?.prototype) return false;
  patchGrpcChannel(g.Channel.prototype, wizelens.tracer);
  patchGrpcServer(g.Server.prototype, wizelens.tracer);
  return true;
}
