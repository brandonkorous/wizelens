// Better Auth's OAuth provider models mapped onto our snake_case tables (db/schema-oauth.ts). The schema test checks them too.
const at = { createdAt: "created_at", updatedAt: "updated_at" };
const token = { clientId: "client_id", sessionId: "session_id", userId: "user_id", referenceId: "reference_id", authorizationCodeId: "authorization_code_id" };

export const oauthSchema = {
  oauthClient: {
    modelName: "oauth_clients",
    fields: {
      ...at,
      clientId: "client_id",
      clientSecret: "client_secret",
      clientDiscoveryId: "client_discovery_id",
      skipConsent: "skip_consent",
      enableEndSession: "enable_end_session",
      subjectType: "subject_type",
      clientCredentialsScopes: "client_credentials_scopes",
      userId: "user_id",
      softwareId: "software_id",
      softwareVersion: "software_version",
      softwareStatement: "software_statement",
      redirectUris: "redirect_uris",
      postLogoutRedirectUris: "post_logout_redirect_uris",
      backchannelLogoutUri: "backchannel_logout_uri",
      backchannelLogoutSessionRequired: "backchannel_logout_session_required",
      tokenEndpointAuthMethod: "token_endpoint_auth_method",
      applicationType: "application_type",
      jwksUri: "jwks_uri",
      grantTypes: "grant_types",
      responseTypes: "response_types",
      requirePKCE: "require_pkce",
      dpopBoundAccessTokens: "dpop_bound_access_tokens",
      referenceId: "reference_id",
    },
  },
  oauthResource: {
    modelName: "oauth_resources",
    fields: {
      ...at,
      accessTokenTtl: "access_token_ttl",
      refreshTokenTtl: "refresh_token_ttl",
      signingAlgorithm: "signing_algorithm",
      signingKeyId: "signing_key_id",
      allowedScopes: "allowed_scopes",
      customClaims: "custom_claims",
      dpopBoundAccessTokensRequired: "dpop_bound_access_tokens_required",
      policyVersion: "policy_version",
    },
  },
  oauthClientResource: { modelName: "oauth_client_resources", fields: { clientId: "client_id", resourceId: "resource_id", createdAt: "created_at" } },
  oauthRefreshToken: {
    modelName: "oauth_refresh_tokens",
    fields: {
      ...token,
      requestedUserInfoClaims: "requested_user_info_claims",
      expiresAt: "expires_at",
      createdAt: "created_at",
      rotatedAt: "rotated_at",
      rotationReplayResponse: "rotation_replay_response",
      rotationReplayExpiresAt: "rotation_replay_expires_at",
      authTime: "auth_time",
    },
  },
  oauthAccessToken: {
    modelName: "oauth_access_tokens",
    fields: { ...token, requestedUserInfoClaims: "requested_user_info_claims", refreshId: "refresh_id", expiresAt: "expires_at", createdAt: "created_at" },
  },
  oauthConsent: {
    modelName: "oauth_consents",
    fields: { ...at, clientId: "client_id", userId: "user_id", referenceId: "reference_id", requestedUserInfoClaims: "requested_user_info_claims" },
  },
  oauthClientAssertion: { modelName: "oauth_client_assertions", fields: { expiresAt: "expires_at" } },
};
