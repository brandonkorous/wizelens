import { prismaExtension } from "../adapters/prisma.js";
import { autoHandle } from "./handle.js";
import { onLoad } from "./module-hooks.js";
import { currentOwner } from "./owner.js";

type Client = Record<string | symbol, unknown> & { $extends?: (extension: unknown) => object };
const WRAPPED = Symbol.for("wizeworks.wizelens.auto.prisma");

// Extended clients drop $on and $use, so those still go to the plain client.
const KEEP_ON_BASE = new Set<string | symbol>(["$on", "$use"]);

type Call = Parameters<ReturnType<typeof prismaExtension>["query"]["$allOperations"]>[0];

// A code install adds its own extension, so this one only traces while the auto instance owns the data.
function autoExtension() {
  const traced = prismaExtension(autoHandle);
  const $allOperations = (call: Call) => (currentOwner()?.auto ? traced.query.$allOperations(call) : call.query(call.args));
  return { name: traced.name, query: { $allOperations } };
}

function extend(base: Client): object {
  const extended = base.$extends?.(autoExtension());
  if (!extended) return base;
  return new Proxy(extended, {
    get: (target, key) => {
      if (!KEEP_ON_BASE.has(key)) return Reflect.get(target, key);
      const value = base[key];
      return typeof value === "function" ? value.bind(base) : value;
    },
  });
}

/** A PrismaClient class whose instances trace every operation, through the same extension as `prismaExtension`. */
function wrapClient(Base: unknown): unknown {
  if (typeof Base !== "function" || (Base as unknown as Record<symbol, unknown>)[WRAPPED]) return undefined;
  class WizeLensPrismaClient extends (Base as new (...args: unknown[]) => object) {
    constructor(...args: unknown[]) {
      super(...args);
      try {
        return extend(this as unknown as Client);
      } catch {
        // A client that cannot be extended still works, untraced.
      }
    }
  }
  Object.defineProperty(WizeLensPrismaClient, WRAPPED, { value: true });
  Object.defineProperty(WizeLensPrismaClient, "name", { value: "PrismaClient" });
  return WizeLensPrismaClient;
}

/** Prisma Client from @prisma/client (the classic generator). */
export function hookPrisma(): void {
  onLoad(/\/node_modules\/@prisma\/client\/(default|index)\.js$/, (exports) => {
    const e = exports as { PrismaClient?: unknown };
    const wrapped = wrapClient(e.PrismaClient);
    if (wrapped) e.PrismaClient = wrapped;
  });
}
