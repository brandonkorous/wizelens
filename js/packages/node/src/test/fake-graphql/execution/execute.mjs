// A stand-in for graphql's ES module build of execute: its binding cannot be patched from outside.
import executor from "./run.js";

export function execute(args) {
  return executor.run(args);
}
