import { Button, Column, Img, Link, Row, Section, Text } from "@react-email/components";
import type { Block, EmailContent } from "./content.js";
import { theme } from "./theme.js";

const textStyle = { margin: "0 0 16px", fontSize: "15px", lineHeight: "24px", color: theme.body };
const noteStyle = { margin: "0 0 16px", fontSize: "13px", lineHeight: "20px", color: theme.muted };

/** The logo, the word mark, and the status dot in the tone's color. */
export function Header({ tone }: { tone: EmailContent["tone"] }) {
  return (
    <Section style={{ padding: "24px 32px 0" }}>
      <Row>
        <Column style={{ width: "32px" }}>
          <Img src={theme.logoUrl} width="28" height="28" alt="WizeLens" style={{ display: "block", borderRadius: "6px" }} />
        </Column>
        <Column>
          <Text style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: theme.ink, letterSpacing: "-0.01em" }}>
            WizeLens <span style={{ color: theme.tone[tone] }}>●</span>
          </Text>
        </Column>
      </Row>
    </Section>
  );
}

function Facts({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <Section style={{ margin: "0 0 16px", padding: "12px 16px", background: theme.factsBg, borderRadius: "8px" }}>
      {rows.map((r) => (
        <Row key={r.label}>
          <Column style={{ width: "40%", padding: "4px 0", fontSize: "13px", color: theme.muted }}>{r.label}</Column>
          <Column style={{ padding: "4px 0", fontSize: "13px", color: theme.ink, fontFamily: theme.mono }}>{r.value}</Column>
        </Row>
      ))}
    </Section>
  );
}

/** One body block. A new block kind needs a case here and in text.ts. */
export function BlockView({ block }: { block: Block }) {
  if (block.kind === "facts") return <Facts rows={block.rows} />;
  return <Text style={block.kind === "note" ? noteStyle : textStyle}>{block.text}</Text>;
}

/** The one button, with the link written out below it for mail apps that hide buttons. */
export function Action({ action }: { action: NonNullable<EmailContent["action"]> }) {
  return (
    <Section style={{ margin: "8px 0 24px" }}>
      <Button href={action.url} style={{ background: theme.accent, color: theme.accentText, fontSize: "15px", fontWeight: 600, padding: "12px 20px", borderRadius: "8px" }}>
        {action.label}
      </Button>
      <Text style={{ ...noteStyle, margin: "16px 0 0", wordBreak: "break-all" }}>
        Or open this link: <Link href={action.url} style={{ color: theme.accent }}>{action.url}</Link>
      </Text>
    </Section>
  );
}
