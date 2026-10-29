import type { Heading } from "@/lib/docs/plugins";

// "On this page" for a narrow screen, where the outline on the right is hidden: a list under the title that opens on a tap.
export function PageJump({ headings }: { headings: Heading[] }) {
  const top = headings.filter((h) => h.depth === 2);
  if (top.length < 3) return null;
  return (
    <details className="wl-jump">
      <summary>On this page <span>{top.length} sections</span></summary>
      <ul>
        {top.map((h) => (
          <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>
        ))}
      </ul>
    </details>
  );
}
