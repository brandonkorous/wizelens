import { vi } from "vitest";

// A small DOM for Node: enough for the HUD to build, morph, attach a shadow root, and take clicks.
type Listener = (e: { type: string; target: unknown; key?: string }) => void;

export class FakeNode {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null = null;
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  connectedRoot = false;

  constructor(nodeType: number, nodeName: string) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }

  get nextSibling(): FakeNode | null {
    const list = this.parentNode?.childNodes ?? [];
    return list[list.indexOf(this) + 1] ?? null;
  }

  get isConnected(): boolean {
    let n: FakeNode | null = this;
    while (n && !n.connectedRoot) n = n instanceof FakeShadowRoot ? n.host : n.parentNode;
    return !!n;
  }

  get textContent(): string {
    return this.nodeType === 3 ? (this.nodeValue ?? "") : this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(text: string) {
    this.childNodes = [];
    this.appendChild(fakeText(text));
  }

  insertBefore(node: FakeNode, ref: FakeNode | null): FakeNode {
    node.parentNode?.removeChild(node);
    const at = ref ? this.childNodes.indexOf(ref) : -1;
    this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, node);
    node.parentNode = this;
    if (node.isConnected) (node as { connectedCallback?(): void }).connectedCallback?.();
    return node;
  }

  appendChild(node: FakeNode): FakeNode {
    return this.insertBefore(node, null);
  }

  append(...nodes: FakeNode[]): void {
    nodes.forEach((n) => this.appendChild(n));
  }

  removeChild(node: FakeNode): FakeNode {
    const was = node.isConnected;
    this.childNodes.splice(this.childNodes.indexOf(node), 1);
    node.parentNode = null;
    if (was) (node as { disconnectedCallback?(): void }).disconnectedCallback?.();
    return node;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }
}

export class FakeShadowRoot extends FakeNode {
  constructor(readonly host: FakeElement) {
    super(11, "#document-fragment");
  }
}

export class FakeElement extends FakeNode {
  namespaceURI = "http://www.w3.org/1999/xhtml";
  checked = false;
  shadowRoot: FakeShadowRoot | null = null;
  readonly #attrs = new Map<string, string>();
  readonly #listeners = new Map<string, Set<Listener>>();

  constructor(tag = "") {
    super(1, tag.toUpperCase());
  }

  getAttribute = (name: string) => this.#attrs.get(name) ?? null;
  hasAttribute = (name: string) => this.#attrs.has(name);
  getAttributeNames = () => [...this.#attrs.keys()];
  removeAttribute = (name: string) => void this.#attrs.delete(name);
  setAttribute(name: string, value: string): void {
    this.#attrs.set(name, String(value));
    (this as { attributeChangedCallback?(): void }).attributeChangedCallback?.();
  }

  addEventListener(type: string, fn: Listener): void {
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: Listener): void {
    this.#listeners.get(type)?.delete(fn);
  }

  fire(type: string): void {
    this.#listeners.get(type)?.forEach((fn) => fn({ type, target: this }));
  }

  attachShadow(): FakeShadowRoot {
    return (this.shadowRoot = new FakeShadowRoot(this));
  }
}

const fakeText = (text: string) => Object.assign(new FakeNode(3, "#text"), { nodeValue: text });

/** Stub `document` and `customElements` with the fake DOM. Returns the page body. */
export function stubHudDom(): FakeElement {
  const defined = new Map<string, new () => FakeElement>();
  const body = Object.assign(new FakeElement("body"), { connectedRoot: true });
  const events = new EventTarget();
  const create = (tag: string) => {
    const Ctor = defined.get(tag);
    return Ctor ? Object.assign(new Ctor(), { nodeName: tag.toUpperCase() }) : new FakeElement(tag);
  };
  const createNS = (ns: string, tag: string) => Object.assign(new FakeElement(), { nodeName: tag, namespaceURI: ns });
  vi.stubGlobal("customElements", { get: (n: string) => defined.get(n), define: (n: string, c: new () => FakeElement) => void defined.set(n, c) });
  vi.stubGlobal("document", {
    ...(globalThis as { document?: object }).document,
    body,
    readyState: "complete",
    createElement: create,
    createElementNS: createNS,
    createTextNode: fakeText,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
  return body;
}

/** Every element under `root` (shadow roots included) for which `test` holds. */
export function findAll(root: FakeNode, test: (el: FakeElement) => boolean): FakeElement[] {
  const out: FakeElement[] = [];
  const walk = (n: FakeNode) => {
    if (n instanceof FakeElement && test(n)) out.push(n);
    if (n instanceof FakeElement && n.shadowRoot) walk(n.shadowRoot);
    n.childNodes.forEach(walk);
  };
  walk(root);
  return out;
}

const hasClass = (el: FakeElement, cls: string) => (el.getAttribute("class") ?? "").split(" ").includes(cls);

/** All elements under `root` with class `cls`. */
export const byClass = (root: FakeNode, cls: string) => findAll(root, (el) => hasClass(el, cls));

/** The first element under `root` with class `cls`. Throws when there is none. */
export function one(root: FakeNode, cls: string): FakeElement {
  const [el] = byClass(root, cls);
  if (!el) throw new Error(`No .${cls}`);
  return el;
}

/** Let queued renders run. */
export const flushRenders = () => new Promise<void>((r) => setTimeout(r, 0));
