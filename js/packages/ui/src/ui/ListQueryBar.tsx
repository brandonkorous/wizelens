import { useHost, useRange } from "../data/host";
import { setQuery } from "../routes";
import { QueryBar } from "./QueryBar";

/** The search language on a list page: free words filter as before; fields and attributes (`status:5xx @user.id:42`) run a search. */
export function ListQueryBar({ value, placeholder, reset = {} }: { value: string; placeholder: string; reset?: Record<string, null> }) {
  const [range] = useRange();
  const server = useHost().has("search");
  return <QueryBar value={value} range={range} server={server} placeholder={placeholder} onSubmit={(q) => setQuery({ q: q || null, page: null, ...reset })} />;
}
