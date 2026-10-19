// A small minified file with its source map, for source map tests in every package.
import { encodeMappings } from "../sourcemaps/vlq.js";
import type { MapLoader } from "../sourcemaps/resolve.js";
import { parseSourceMap } from "../sourcemaps/map.js";

export const CART_SOURCE = [
  "export function applyCoupon(code) {",
  "  if (!code) {",
  '    throw new Error("Coupon code is empty");',
  "  }",
  "  return code;",
  "}",
  'export const checkout = () => applyCoupon("");',
].join("\n");

export const CART_MINIFIED = 'function a(o){if(!o)throw new Error("Coupon code is empty");return o}const c=()=>a("");';
export const CART_URL = "https://app.test/assets/index-abc.js";
export const CART_FILE = "assets/index-abc.js";

/** 1-based columns in the minified line: the `new Error` and the `a("")` call. */
export const NEW_COL = CART_MINIFIED.indexOf("new Error") + 1;
export const CALL_COL = CART_MINIFIED.indexOf('a("")') + 1;

const segments = [
  [0, 0, 0, 0],
  [CART_MINIFIED.indexOf("throw"), 0, 2, 4],
  [NEW_COL - 1, 0, 2, 10, 0],
  [CART_MINIFIED.indexOf("const c"), 0, 6, 7],
  [CALL_COL - 1, 0, 6, 30],
];

export const CART_MAP = JSON.stringify({
  version: 3,
  file: "index-abc.js",
  sources: ["../../src/cart.ts"],
  sourcesContent: [CART_SOURCE],
  names: ["Error"],
  mappings: encodeMappings([segments]),
});

export const CART_STACK = [
  "Error: Coupon code is empty",
  `    at a (${CART_URL}:1:${NEW_COL})`,
  `    at c (${CART_URL}:1:${CALL_COL})`,
  "    at https://app.test/node_modules/react-dom.js:5:10",
].join("\n");

/** Finds CART_MAP for CART_URL only. */
export const cartLoader: MapLoader = async (url) => (url === CART_URL ? parseSourceMap(CART_MAP) : null);
