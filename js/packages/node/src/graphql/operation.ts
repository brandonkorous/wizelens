import { type Attributes, type Span as OtelSpan, SpanStatusCode } from "@opentelemetry/api";
import { documentText, type LocationLike } from "./document.js";

// Minimal graphql-js shapes, so the add-on has no dependency on graphql.
interface DefinitionLike {
  kind: string;
  operation?: string;
  name?: { value?: string };
}
export interface DocumentLike {
  definitions?: readonly DefinitionLike[];
  loc?: LocationLike;
}
export interface ExecutionArgsLike {
  schema?: unknown;
  document?: DocumentLike;
  operationName?: string | null;
}
interface GraphQLErrorLike {
  message?: string;
  name?: string;
  stack?: string;
  path?: readonly (string | number)[];
  originalError?: unknown;
}

/** The operation one execute call runs. */
export interface Operation {
  type: string;
  name: string | undefined;
}

const MAX_ERRORS = 10;

/** The call of `execute(args)`, or of graphql 15's `execute(schema, document, rootValue, contextValue, variables, operationName)`. */
export function callOf(args: readonly unknown[]): ExecutionArgsLike | null {
  const first = args[0] as ExecutionArgsLike | null | undefined;
  if (args.length === 1 && first && typeof first === "object" && first.document) return first;
  const document = args[1] as DocumentLike | undefined;
  if (!document?.definitions) return null;
  return { schema: args[0], document, operationName: args[5] as string | null | undefined };
}

/** The operation a document runs: the one named `operationName`, or its only operation. */
export function operationOf(call: ExecutionArgsLike): Operation {
  const ops = (call.document?.definitions ?? []).filter((d) => d.kind === "OperationDefinition");
  const wanted = call.operationName ? ops.find((d) => d.name?.value === call.operationName) : ops.length === 1 ? ops[0] : undefined;
  return { type: wanted?.operation ?? "query", name: wanted?.name?.value ?? call.operationName ?? undefined };
}

/** "query GetOrders", or "query" for an anonymous operation. */
export const spanNameOf = (op: Operation): string => (op.name ? `${op.type} ${op.name}` : op.type);

/** The name an operation adds to its request's endpoint: its name, else "anonymous query". */
export const endpointPartOf = (op: Operation): string => op.name ?? `anonymous ${op.type}`;

/** Span attributes of one operation. The document keeps its shape; literal values are replaced, variables never stored. */
export function operationAttributes(op: Operation, call: ExecutionArgsLike, withDocument: boolean): Attributes {
  const attributes: Attributes = { "graphql.operation.type": op.type };
  if (op.name) attributes["graphql.operation.name"] = op.name;
  const text = withDocument ? documentText(call.document?.loc) : undefined;
  if (text) attributes["graphql.document"] = text;
  return attributes;
}

function recordGraphqlError(span: OtelSpan, error: GraphQLErrorLike): void {
  const cause = error.originalError instanceof Error ? error.originalError : undefined;
  const attributes: Attributes = {
    "exception.type": cause?.name ?? error.name ?? "GraphQLError",
    "exception.message": error.message ?? String(error),
  };
  const stack = cause?.stack ?? error.stack;
  if (stack) attributes["exception.stacktrace"] = stack;
  if (error.path?.length) attributes["graphql.error.path"] = error.path.join(".");
  span.addEvent("exception", attributes);
}

/** Record the `errors` of an execution result (GraphQL answers errors, it does not throw them). */
export function recordResultErrors(span: OtelSpan, result: unknown): void {
  const errors = (result as { errors?: unknown } | null | undefined)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return;
  for (const error of errors.slice(0, MAX_ERRORS)) recordGraphqlError(span, (error ?? {}) as GraphQLErrorLike);
  span.setAttribute("graphql.error.count", errors.length);
  const first = errors[0] as GraphQLErrorLike | undefined;
  span.setStatus({ code: SpanStatusCode.ERROR, message: first?.message ?? "GraphQL error" });
}
