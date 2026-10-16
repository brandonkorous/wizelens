import { captureOf } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { patchGrpcChannel } from "./client.js";
import { patchGrpcServer } from "./server.js";
import type { GrpcModuleLike } from "./shared.js";

/** Trace @grpc/grpc-js calls in and out: `instrumentGrpc(wizelens, grpc)`. Call it before `server.addService`. Returns false when nothing was patched. */
export function instrumentGrpc(wizelens: WizeLens, grpc: unknown): boolean {
  const g = grpc as GrpcModuleLike | null;
  const deps = captureOf(wizelens);
  if (!deps || !g?.Channel?.prototype || !g.Server?.prototype) return false;
  const onRemote = (traceId: string, endpoint: string) => !deps.selfEndpoints.has(endpoint) && wizelens.store.addRemote(traceId, endpoint);
  patchGrpcChannel(g.Channel.prototype, wizelens.tracer, onRemote);
  const endpoint = () => deps.publicEndpoint ?? deps.selfEndpoints.values().next().value;
  patchGrpcServer(g.Server.prototype, wizelens.tracer, { endpoint, Metadata: g.Metadata });
  return true;
}
