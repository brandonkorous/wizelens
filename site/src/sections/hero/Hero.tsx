import { Headline, riseDelay } from "@/components/ui/Headline";
import { ArrowRight, GitHubIcon } from "@/components/ui/icons";
import { LINKS } from "@/lib/links";
import { Stage } from "./Stage";

export function Hero() {
  return (
    <section className="wl-hero" id="top">
      <div className="wl-wrap">
        <div className="wl-hero-head">
          <Headline lines={["See what", "matters."]} />
          <div className="wl-hero-side wl-rise" style={riseDelay(0.35)}>
            <p className="wl-lede">
              WizeLens shows you everything one request did. The click in React, your .NET and Node services, every
              SQL query, and the render, on one timeline. The problems are found for you.
            </p>
            <div className="wl-hero-cta">
              <a href={LINKS.start} className="wl-btn wl-btn-primary">Get started <ArrowRight /></a>
              <a href={LINKS.repo} className="wl-btn wl-btn-ghost"><GitHubIcon /> View on GitHub</a>
            </div>
            <p className="wl-hero-note">Open source under MIT. For .NET 10, Node, React, and Next.js.</p>
          </div>
        </div>
        <Stage />
      </div>
    </section>
  );
}
