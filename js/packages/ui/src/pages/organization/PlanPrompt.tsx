import { Sparkles } from "lucide-react";
import { type Feature, type PlanId, useUsage } from "../../data/billing";
import { hrefTo } from "../../routes";
import { Panel } from "../../ui/Panel";

const NAME: Record<Feature, string> = { sso: "Single sign-on", scim: "SCIM provisioning", auditExport: "Audit log export" };
const NEEDS: Record<Feature, PlanId> = { sso: "business", scim: "business", auditExport: "business" };
const PLAN_NAME: Record<PlanId, string> = { unlimited: "Unlimited", free: "Free", team: "Team", business: "Business", enterprise: "Enterprise" };

/** True when the organization's plan has the feature: always while billing is off, and while the plan is still loading. */
export function useFeature(orgId: string, feature: Feature): { allowed: boolean; loaded: boolean; plan: string } {
  const { data } = useUsage(orgId);
  return { allowed: !data || !data.billing || data.plan.features[feature], loaded: !!data, plan: data?.plan.name ?? "" };
}

/** What a gated feature shows in place of an error: the plan it needs, and the way to it. */
export function PlanPrompt({ feature, plan, compact = false }: { feature: Feature; plan: string; compact?: boolean }) {
  const needs = PLAN_NAME[NEEDS[feature]];
  const body = (
    <div className="wl-plan-prompt">
      <Sparkles aria-hidden="true" />
      <div>
        <strong>{NAME[feature]} is on the {needs} plan.</strong>
        <p className="wl-muted">This organization is on {PLAN_NAME[plan as PlanId] ?? plan}. Owners and admins can upgrade on the Billing page; nothing else changes.</p>
      </div>
      <a className="wl-btn wl-btn-primary" href={hrefTo("organization", ["billing"])}>
        Upgrade to {needs}
      </a>
    </div>
  );
  return compact ? body : <Panel>{body}</Panel>;
}
