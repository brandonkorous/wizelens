import { Nav } from "@/components/nav/Nav";
import { Providers } from "@/lib/Providers";
import { Hero } from "@/sections/hero/Hero";
import { Journey } from "@/sections/journey/Journey";
import { Insight } from "@/sections/insight/Insight";
import { Bento } from "@/sections/bento/Bento";
import { AiAccess } from "@/sections/ai/AiAccess";
import { Tour } from "@/sections/tour/Tour";
import { Install } from "@/sections/install/Install";
import { Grow } from "@/sections/grow/Grow";
import { Stack } from "@/sections/stack/Stack";
import { Closing } from "@/sections/closing/Closing";
import { Footer } from "@/sections/closing/Footer";

// The story, in order: see it, follow one click, get the fix, see everything, let AI in, try it, grow.
export default function Home() {
  return (
    <Providers>
      <Nav />
      <main>
        <Hero />
        <Journey />
        <Insight />
        <Bento />
        <AiAccess />
        <Tour />
        <Install />
        <Grow />
        <Stack />
        <Closing />
      </main>
      <Footer />
    </Providers>
  );
}
