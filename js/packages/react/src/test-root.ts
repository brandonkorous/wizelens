import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";

// React's client renderer in Node, for trees that render no DOM of their own (the HUD is mocked).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface TestRoot {
  render(node: ReactNode): Promise<void>;
  unmount(): Promise<void>;
}

/** A React root on a stand-in container: enough page for effects to run. */
export function testRoot(): TestRoot {
  class HTMLIFrameElement {}
  vi.stubGlobal("window", { event: undefined, HTMLIFrameElement });
  vi.stubGlobal("document", { activeElement: null, body: null });
  const doc = { nodeType: 9, addEventListener() {}, removeEventListener() {} };
  const container = { nodeType: 1, nodeName: "DIV", tagName: "DIV", namespaceURI: null, ownerDocument: doc, addEventListener() {}, removeEventListener() {} };
  const root = createRoot(container as unknown as Element);
  return {
    render: (node) => act(async () => root.render(node)),
    unmount: () => act(async () => root.unmount()),
  };
}
