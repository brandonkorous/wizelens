import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/footer/Footer";
import { Providers } from "@/lib/Providers";
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

const inter = Inter({ subsets: ["latin"], variable: "--wl-font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--wl-font-mono", display: "swap" });

const description =
  "WizeLens shows you everything one request did: from the click in React to the SQL in your database, across every service. Open source, OpenTelemetry-native, and readable by AI agents only when you allow it.";

export const metadata: Metadata = {
  metadataBase: new URL("https://wizelens.dev"),
  title: { default: "WizeLens: see what matters", template: "%s · WizeLens" },
  description,
  applicationName: "WizeLens",
  openGraph: { title: "WizeLens: see what matters", description, type: "website", siteName: "WizeLens" },
  twitter: { card: "summary_large_image", title: "WizeLens: see what matters", description },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <Providers>
          <Nav />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
