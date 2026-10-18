import { Suspense } from "react";
import { JsonLd } from "@/components/seo/JsonLd";
import { faq, graph, software } from "@/lib/schema";
import { HOME_DESCRIPTION, pageMeta } from "@/lib/seo";
import { Hero } from "@/sections/hero/Hero";
import { Journey } from "@/sections/journey/Journey";
import { Insight } from "@/sections/insight/Insight";
import { Bento } from "@/sections/bento/Bento";
import { AiAccess } from "@/sections/ai/AiAccess";
import { Tour } from "@/sections/tour/Tour";
import { Install } from "@/sections/install/Install";
import { Grow } from "@/sections/grow/Grow";
import { Stack } from "@/sections/stack/Stack";
import { Faq } from "@/sections/faq/Faq";
import { FAQS } from "@/sections/faq/faqs";
import { Closing } from "@/sections/closing/Closing";

export const metadata = pageMeta({
  path: "/",
  title: "WizeLens: see inside every request, from React to SQL",
  absolute: true,
  description: HOME_DESCRIPTION,
  image: "home",
  imageAlt: "WizeLens: see what matters. A HUD card shows one request: 305 ms total, 263 ms server, 9.6 ms database, 35 ms render.",
});

// The story in order; each section below the hero wakes up on its own, so the phone never freezes.
export default function Home() {
  return (
    <main>
      <JsonLd data={graph(software(HOME_DESCRIPTION), faq(FAQS))} />
      <Hero />
      <Suspense><Journey /></Suspense>
      <Suspense><Insight /></Suspense>
      <Suspense><Bento /></Suspense>
      <Suspense><AiAccess /></Suspense>
      <Suspense><Tour /></Suspense>
      <Suspense><Install /></Suspense>
      <Suspense><Grow /></Suspense>
      <Suspense><Stack /></Suspense>
      <Suspense><Faq /></Suspense>
      <Suspense><Closing /></Suspense>
    </main>
  );
}
