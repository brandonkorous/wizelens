import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata = { title: "WizeLens Next.js sample" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", margin: 40 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
