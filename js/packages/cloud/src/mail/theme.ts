// The look of every email, from the WizeLens brand guide. Solid colors only. A new design changes this file and layout.tsx.
export const theme = {
  page: "#f6f7f9",
  card: "#ffffff",
  line: "#e5e8ee",
  ink: "#1f1f1f",
  body: "#3d4350",
  muted: "#586273",
  accent: "#2563eb",
  accentText: "#ffffff",
  factsBg: "#f6f7f9",
  tone: { neutral: "#2563eb", good: "#22c55e", warn: "#f4b400", bad: "#e63946" },
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  radius: "12px",
  width: 560,
  logoUrl: "https://wizelens.com/brand/wizelens-mark-512.png",
  homeUrl: "https://wizelens.com",
  company: "WizeLens by WizeWorks LLC, Visalia, California",
} as const;

export type Tone = keyof typeof theme.tone;
