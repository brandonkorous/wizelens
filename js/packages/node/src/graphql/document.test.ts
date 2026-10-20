import { trace } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";
import { addOperation, namedRoute, setFallbackRoute } from "../request-naming.js";
import { documentText, scrubDocument } from "./document.js";
import { callOf, endpointPartOf, operationOf, spanNameOf } from "./operation.js";

describe("scrubDocument", () => {
  it("replaces strings, block strings, and numbers, and keeps names, variables, and enums", () => {
    const text = `mutation Pay($card: String!) {
      pay(amount: -12.5e3, note: "a \\"quoted\\" note", memo: """multi
      line""", currency: USD, card: $card, tries: 3) { id2 }
    }`;
    expect(scrubDocument(text)).toBe('mutation Pay($card: String!) { pay(amount: *, note: "*", memo: "*", currency: USD, card: $card, tries: *) { id2 } }');
  });

  it("drops comments and keeps long documents short", () => {
    expect(scrubDocument("# secret 42\n{ a }")).toBe("{ a }");
    expect(scrubDocument(`{ ${"a ".repeat(5000)}}`).length).toBe(8193);
  });

  it("reads the source of a parsed document, or nothing without a location", () => {
    expect(documentText({ start: 6, end: 17, source: { body: "skip; { a(x: 1) } skip" } })).toBe("{ a(x: *) }");
    expect(documentText(undefined)).toBeUndefined();
  });
});

describe("operationOf", () => {
  const document = {
    definitions: [
      { kind: "OperationDefinition", operation: "query", name: { value: "A" } },
      { kind: "FragmentDefinition", name: { value: "F" } },
      { kind: "OperationDefinition", operation: "mutation", name: { value: "B" } },
    ],
  };

  it("picks the named operation, or the only one", () => {
    expect(operationOf({ document, operationName: "B" })).toEqual({ type: "mutation", name: "B" });
    expect(operationOf({ document: { definitions: [{ kind: "OperationDefinition", operation: "subscription" }] } })).toEqual({ type: "subscription", name: undefined });
    expect(spanNameOf({ type: "query", name: "A" })).toBe("query A");
    expect(endpointPartOf({ type: "mutation", name: undefined })).toBe("anonymous mutation");
  });

  it("reads graphql 16 args and graphql 15 positional args", () => {
    expect(callOf([{ schema: 1, document }])).toMatchObject({ schema: 1, document });
    expect(callOf([1, document, null, null, null, "A"])).toMatchObject({ schema: 1, document, operationName: "A" });
    expect(callOf(["not graphql"])).toBeNull();
  });
});

describe("request naming", () => {
  it("adds the operations to the route, and uses the fallback route when the router has none", () => {
    const span = trace.wrapSpanContext({ traceId: "1".repeat(32), spanId: "2".repeat(16), traceFlags: 1 });
    expect(namedRoute(span, undefined, "/graphql")).toBeUndefined();
    setFallbackRoute(span, "/orders/:id");
    expect(namedRoute(span, undefined, "/orders/7")).toBe("/orders/:id");
    for (const name of ["A", "B", "A", "C", "D"]) addOperation(span, name);
    expect(namedRoute(span, "/graphql", "/graphql")).toBe("/graphql (A, B, C, +1)");
  });
});
