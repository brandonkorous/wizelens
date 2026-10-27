import { fmtDate } from "../../format";
import type { AskOptions } from "../../ui/Dialog";

const DAY_MS = 86_400_000;
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** Asked before data is kept for less time: what goes, from which date, and that it is gone for good. */
export function shortenAsk(items: string, fromDays: number, toDays: number, now = Date.now()): AskOptions {
  return {
    title: `Keep ${days(toDays)} instead of ${days(fromDays)}?`,
    body: `${items} from before ${fmtDate(now - toDays * DAY_MS)} are deleted within minutes. They cannot be brought back.`,
    confirmLabel: `Keep ${days(toDays)}`,
    cancelLabel: `Keep ${days(fromDays)}`,
    danger: true,
  };
}
