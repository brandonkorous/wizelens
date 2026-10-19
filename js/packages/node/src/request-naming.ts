import type { Span as OtelSpan } from "@opentelemetry/api";

/** What a framework or library told WizeLens about a request, beyond what its router knows. */
interface Naming {
  route?: string;
  operations: string[];
}

const namings = new WeakMap<OtelSpan, Naming>();
const MAX_SHOWN = 3;

function namingOf(span: OtelSpan): Naming {
  let naming = namings.get(span);
  if (!naming) namings.set(span, (naming = { operations: [] }));
  return naming;
}

/** The route template ("/orders/:id") to use when the router does not report one, for example from NestJS metadata. */
export function setFallbackRoute(span: OtelSpan, route: string): void {
  namingOf(span).route = route;
}

/** Name an operation the request ran, such as a GraphQL query: the endpoint then reads "POST /graphql (GetOrders)". */
export function addOperation(span: OtelSpan, name: string): void {
  const { operations } = namingOf(span);
  if (name && !operations.includes(name)) operations.push(name);
}

/** The route a finished request is named by: the router's, else the fallback, with the operations it ran. */
export function namedRoute(span: OtelSpan, route: string | undefined, path: string): string | undefined {
  const naming = namings.get(span);
  const base = route ?? naming?.route;
  const ops = naming?.operations ?? [];
  if (ops.length === 0) return base;
  const shown = ops.length > MAX_SHOWN ? [...ops.slice(0, MAX_SHOWN), `+${ops.length - MAX_SHOWN}`] : ops;
  return `${base ?? path} (${shown.join(", ")})`;
}
