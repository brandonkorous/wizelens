// A small element builder and a morph that patches the live HUD in place, so hover, focus, and open tips survive updates.

export type Child = Node | string | number | null | undefined | false | Child[];
type Handler = (e: Event) => void;
export type Attrs = Record<string, string | number | boolean | null | undefined | Handler>;

const SVG_NS = "http://www.w3.org/2000/svg";
// Keys match nodes across renders when siblings come and go, like a panel opening above the card.
const keys = new WeakMap<Node, string>();

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false || child === "") return;
  if (Array.isArray(child)) return child.forEach((c) => append(parent, c));
  parent.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
}

function setAttrs(el: Element, attrs: Attrs | null | undefined): void {
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (name === "key") keys.set(el, String(value));
    else if (typeof value === "function") el.addEventListener(name.slice(2).toLowerCase(), value);
    else if (name === "checked") (el as HTMLInputElement).checked = value === true;
    else if (value === true) el.setAttribute(name, "");
    else if (value !== false && value !== null && value !== undefined) el.setAttribute(name, String(value));
  }
}

/** An HTML element. `onClick`-style attributes add listeners; `key` names it for the morph. */
export function h(tag: string, attrs?: Attrs | null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  append(el, children);
  return el;
}

/** An SVG element. */
export function s(tag: string, attrs?: Attrs | null, ...children: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  setAttrs(el, attrs);
  append(el, children);
  return el;
}

const sameKind = (a: Node, b: Node) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a as Element).namespaceURI === (b as Element).namespaceURI;

function syncAttrs(live: Element, fresh: Element): void {
  for (const name of live.getAttributeNames()) if (!fresh.hasAttribute(name)) live.removeAttribute(name);
  for (const name of fresh.getAttributeNames()) {
    const value = fresh.getAttribute(name)!;
    if (live.getAttribute(name) !== value) live.setAttribute(name, value);
  }
  if (live.nodeName === "INPUT") (live as HTMLInputElement).checked = (fresh as HTMLInputElement).checked;
}

/** Make `live` look like `fresh`. Listeners stay on the live node, so handlers must read state when they run. */
export function morph(live: Node, fresh: Node): void {
  if (live.nodeType !== 1) {
    if (live.nodeValue !== fresh.nodeValue) live.nodeValue = fresh.nodeValue;
    return;
  }
  syncAttrs(live as Element, fresh as Element);
  morphChildren(live, Array.from(fresh.childNodes));
}

function matchOf(fresh: Node, ref: Node | null, byKey: Map<string, Node>): Node | undefined {
  const key = keys.get(fresh);
  const found = key !== undefined ? byKey.get(key) : ref && !keys.has(ref) ? ref : undefined;
  return found && sameKind(found, fresh) ? found : undefined;
}

/** Patch `parent`'s children to match `fresh`, reusing nodes by key, else by position. */
export function morphChildren(parent: Node, fresh: Node[]): void {
  const byKey = new Map<string, Node>();
  parent.childNodes.forEach((n) => keys.has(n) && byKey.set(keys.get(n)!, n));
  let ref: Node | null = parent.firstChild;
  for (const node of fresh) {
    const match = matchOf(node, ref, byKey);
    if (match) morph(match, node);
    const live = match ?? node;
    if (live === ref) {
      ref = ref.nextSibling;
      continue;
    }
    parent.insertBefore(live, ref);
    // An unkeyed node of another kind at this position is replaced, so the nodes after it still line up.
    if (ref && !keys.has(ref) && !keys.has(node)) {
      const next: Node | null = ref.nextSibling;
      parent.removeChild(ref);
      ref = next;
    }
  }
  while (ref) {
    const next: Node | null = ref.nextSibling;
    parent.removeChild(ref);
    ref = next;
  }
}
