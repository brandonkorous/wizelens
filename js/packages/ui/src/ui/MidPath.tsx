import { shortPath } from "../format";

/** A path that keeps its last step whole and cuts the middle when it does not fit: "/api/v1/clans/…/members". The full path is the title. */
export function MidPath({ path, className = "" }: { path: string; className?: string }) {
  const s = shortPath(path);
  const at = s.search(/[?#]/);
  const route = at < 0 ? s : s.slice(0, at);
  const cut = route.lastIndexOf("/");
  if (cut <= 0) return <span className={`wl-truncate ${className}`.trim()} title={path}>{s}</span>;
  return (
    <span className={`wl-mid ${className}`.trim()} title={path}>
      <span className="wl-mid-head">{route.slice(0, cut)}</span>
      <span className="wl-mid-tail">{s.slice(cut)}</span>
    </span>
  );
}
