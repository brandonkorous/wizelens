import { Article } from "@/components/docs/Article";
import { loadReleases, type Release } from "@/lib/changelog";
import { JumpRow } from "./JumpRow";
import { ReleaseDot, ReleaseRail } from "./ReleaseRail";

function Entry({ r, current }: { r: Release; current: boolean }) {
  const unreleased = r.id === "unreleased";
  return (
    <section className="wl-cl-entry" id={r.id}>
      <header className="wl-cl-side">
        <ReleaseDot current={current} />
        <h2>{unreleased ? "Unreleased" : r.version}</h2>
        {r.title && <p>{r.title}</p>}
        {unreleased && <p>On main, in the next release</p>}
        <ul>{r.sections.map((s) => <li key={s}>{s}</li>)}</ul>
      </header>
      <div className="wl-cl-body"><Article html={r.html} /></div>
    </section>
  );
}

export async function Changelog() {
  const releases = await loadReleases();
  return (
    <main>
      <section className="wl-cl-hero">
        <div className="wl-wrap">
          <h1 className="wl-display">Changelog.</h1>
          <p className="wl-lede">Every change to WizeLens, newest first. This page is built from CHANGELOG.md in the repo, so it always matches it.</p>
          <JumpRow>
            {releases.map((r) => <a key={r.id} href={`#${r.id}`}>{r.id === "unreleased" ? "Unreleased" : r.version}</a>)}
          </JumpRow>
        </div>
      </section>
      <div className="wl-wrap">
        <ReleaseRail>
          {releases.map((r, i) => <Entry key={r.id} r={r} current={i === 0} />)}
        </ReleaseRail>
      </div>
    </main>
  );
}
