import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import { Action, BlockView, Header } from "./blocks.js";
import type { EmailContent } from "./content.js";
import { theme } from "./theme.js";

const footerText = { margin: "0 0 4px", fontSize: "12px", lineHeight: "18px", color: theme.muted };

/** The frame every email shares: a light page, one white card with a top stripe in the tone's color, the header, the body, and the footer under the card. */
export function EmailLayout({ content: c }: { content: EmailContent }) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{c.preview}</Preview>
      <Body style={{ margin: 0, padding: "32px 12px", background: theme.page, fontFamily: theme.sans }}>
        <Container style={{ maxWidth: `${theme.width}px`, background: theme.card, border: `1px solid ${theme.line}`, borderTop: `4px solid ${theme.tone[c.tone]}`, borderRadius: theme.radius }}>
          <Header tone={c.tone} />
          <Section style={{ padding: "8px 32px 8px" }}>
            <Heading as="h1" style={{ margin: "16px 0", fontSize: "26px", lineHeight: "32px", fontWeight: 800, letterSpacing: "-0.02em", color: theme.ink }}>
              {c.heading}
            </Heading>
            {c.blocks.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
            {c.action && <Action action={c.action} />}
          </Section>
        </Container>
        <Container style={{ maxWidth: `${theme.width}px`, padding: "16px 32px 0" }}>
          <Text style={footerText}>{c.footer}</Text>
          {c.unsubscribe && (
            <Text style={footerText}>
              <Link href={c.unsubscribe.url} style={{ color: theme.muted, textDecoration: "underline" }}>
                {c.unsubscribe.label}
              </Link>
            </Text>
          )}
          <Hr style={{ margin: "12px 0", borderColor: theme.line }} />
          <Text style={footerText}>
            <Link href={theme.homeUrl} style={{ color: theme.muted }}>
              {theme.company}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
