// Draws an element tree to a PNG with Satori and resvg: real fonts, no browser, same pixels every build.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

function font(pkg, file, name, weight) {
  return { name, weight, style: "normal", data: readFileSync(join(pkgDir(pkg), "files", file)) };
}

const FONTS = [
  font("@fontsource/inter", "inter-latin-400-normal.woff", "Inter", 400),
  font("@fontsource/inter", "inter-latin-700-normal.woff", "Inter", 700),
  font("@fontsource/jetbrains-mono", "jetbrains-mono-latin-500-normal.woff", "Mono", 500),
  font("@fontsource/jetbrains-mono", "jetbrains-mono-latin-700-normal.woff", "Mono", 700),
];

export function h(type, props, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { ...(props ?? {}), children: kids.length === 1 ? kids[0] : kids } };
}

export async function toPng(element, width = 1200, height = 630) {
  const svg = await satori(element, { width, height, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
}

export async function svgToPng(svg, size) {
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}
