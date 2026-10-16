/** Loggers that WizeLens reads directly. Their OpenTelemetry bridge records are skipped, so no line shows twice. */
const direct = new Set<string>();

export const markDirect = (library: "pino" | "winston" | "bunyan") => void direct.add(library);

/** True for a record from `@opentelemetry/instrumentation-<library>` when WizeLens already reads that library. */
export function isBridged(scope: string | undefined): boolean {
  const m = /^@opentelemetry\/instrumentation-(pino|winston|bunyan)$/.exec(scope ?? "");
  return !!m && direct.has(m[1]!);
}
