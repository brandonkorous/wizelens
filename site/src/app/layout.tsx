import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/footer/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { Providers } from "@/lib/Providers";
import { graph, organization, website } from "@/lib/schema";
import { HOME_DESCRIPTION, SITE } from "@/lib/seo";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/nav.css";
import "@/styles/hero.css";
import "@/styles/hud.css";
import "@/styles/journey.css";
import "@/styles/insight.css";
import "@/styles/bento.css";
import "@/styles/tiles.css";
import "@/styles/ai.css";
import "@/styles/tour.css";
import "@/styles/install.css";
import "@/styles/grow.css";
import "@/styles/stack.css";
import "@/styles/closing.css";
import "@/styles/docs.css";
import "@/styles/prose.css";
import "@/styles/search.css";
import "@/styles/stacks.css";
import "@/styles/story.css";
import "@/styles/changelog.css";
import "@/styles/cloud.css";
import "@/styles/faq.css";
import "@/styles/pricing.css";

const inter = Inter({ subsets: ["latin"], variable: "--wl-font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--wl-font-mono", display: "swap", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "WizeLens: see inside every request, from React to SQL", template: "%s · WizeLens" },
  description: HOME_DESCRIPTION,
  applicationName: SITE.name,
  authors: [{ name: SITE.company, url: SITE.url }],
  creator: SITE.company,
  publisher: SITE.company,
  category: "technology",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <JsonLd data={graph(organization(), website())} />
        <Providers>
          <Nav />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
