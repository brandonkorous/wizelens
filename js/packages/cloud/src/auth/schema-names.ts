// Better Auth's models mapped onto our snake_case tables (db/schema-auth.ts). A test checks Better Auth finds nothing to change.
export const userNames = { modelName: "users", fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" } };

export const sessionNames = {
  modelName: "sessions",
  fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at", ipAddress: "ip_address", userAgent: "user_agent", userId: "user_id" },
};

export const accountNames = {
  modelName: "accounts",
  fields: {
    accountId: "account_id",
    providerId: "provider_id",
    userId: "user_id",
    accessToken: "access_token",
    refreshToken: "refresh_token",
    idToken: "id_token",
    accessTokenExpiresAt: "access_token_expires_at",
    refreshTokenExpiresAt: "refresh_token_expires_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
};

export const verificationNames = { modelName: "verifications", fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" } };

export const rateLimitNames = { modelName: "rate_limits", fields: { lastRequest: "last_request" } };

export const orgSchema = {
  session: { fields: { activeOrganizationId: "active_org_id" } },
  organization: {
    modelName: "orgs",
    fields: { createdAt: "created_at" },
    additionalFields: { retentionDays: { type: "number", required: true, defaultValue: 30, input: false, fieldName: "retention_days" } },
  },
  member: { modelName: "members", fields: { organizationId: "org_id", userId: "user_id", createdAt: "created_at" } },
  invitation: { modelName: "invites", fields: { organizationId: "org_id", expiresAt: "expires_at", createdAt: "created_at", inviterId: "inviter_id" } },
} as const;

export const twoFactorSchema = {
  user: { fields: { twoFactorEnabled: "two_factor_enabled" } },
  twoFactor: {
    modelName: "two_factors",
    fields: { backupCodes: "backup_codes", userId: "user_id", failedVerificationCount: "failed_verification_count", lockedUntil: "locked_until" },
  },
};

export const passkeySchema = {
  passkey: {
    modelName: "passkeys",
    fields: { publicKey: "public_key", userId: "user_id", credentialID: "credential_id", deviceType: "device_type", backedUp: "backed_up", createdAt: "created_at" },
  },
};

/** Better Auth's Stripe plugin: the organization is the Stripe customer and owns the subscription (billing/stripe-plugin.ts). */
export const stripeSchema = {
  user: { modelName: "users", fields: { stripeCustomerId: "stripe_customer_id" } },
  organization: { modelName: "orgs", fields: { stripeCustomerId: "stripe_customer_id" } },
  subscription: {
    modelName: "subscriptions",
    fields: {
      referenceId: "reference_id",
      stripeCustomerId: "stripe_customer_id",
      stripeSubscriptionId: "stripe_subscription_id",
      periodStart: "period_start",
      periodEnd: "period_end",
      trialStart: "trial_start",
      trialEnd: "trial_end",
      cancelAtPeriodEnd: "cancel_at_period_end",
      cancelAt: "cancel_at",
      canceledAt: "canceled_at",
      endedAt: "ended_at",
      billingInterval: "billing_interval",
      stripeScheduleId: "stripe_schedule_id",
    },
  },
};

export const ssoSchema = {
  ssoProvider: {
    modelName: "sso_providers",
    fields: { providerId: "provider_id", oidcConfig: "oidc_config", samlConfig: "saml_config", userId: "user_id", organizationId: "org_id", domainVerified: "domain_verified" },
  },
};
