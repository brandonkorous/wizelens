import type { Instrumentation } from "next";

export async function register() {
  // The runtime check must wrap the import, so the Edge build leaves the package out.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerWizeLens } = await import("@wizeworks/lens-node/next");
    registerWizeLens({ service: "next-web" });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { onRequestError } = await import("@wizeworks/lens-node/next");
    onRequestError(...args);
  }
};
