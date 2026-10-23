import { type FormEvent, useState } from "react";
import { auth } from "../../data/account";
import { authBase } from "../../data/auth-client";
import { act } from "../../data/useApi";
import { Field, FormRow, SelectField, TextArea } from "../../ui/Field";
import { Modal } from "../../ui/Modal";

type Kind = "oidc" | "saml";
type Values = Record<string, string>;

const KINDS: [Kind, string][] = [
  ["oidc", "OpenID Connect"],
  ["saml", "SAML 2.0"],
];

/** Our SAML entity id: the metadata address, which is unique per provider. */
export const spEntityId = (providerId: string) => `${authBase()}/sso/saml2/sp/metadata?providerId=${encodeURIComponent(providerId)}`;

/** What Better Auth's `sso/register` needs. OIDC finds the rest from the issuer; SAML always wants signed assertions. */
function bodyOf(kind: Kind, organizationId: string, v: Values) {
  const base = { providerId: v.providerId!, domain: v.domain!.trim().toLowerCase(), organizationId };
  if (kind === "oidc") return { ...base, issuer: v.issuer!.trim(), oidcConfig: { clientId: v.clientId!, clientSecret: v.clientSecret!, pkce: true } };
  const idpMetadata = { entityID: v.entityId!.trim(), cert: v.cert!.trim() };
  return { ...base, issuer: spEntityId(v.providerId!), samlConfig: { entryPoint: v.entryPoint!.trim(), idpMetadata, wantAssertionsSigned: true } };
}

function OidcFields() {
  return (
    <FormRow>
      <Field label="Issuer URL" name="issuer" type="url" required placeholder="https://acme.okta.com" hint="Its origin must be in the cloud's --sso-origins." />
      <Field label="Client ID" name="clientId" required autoComplete="off" />
      <Field label="Client secret" name="clientSecret" type="password" required autoComplete="off" />
    </FormRow>
  );
}

function SamlFields() {
  return (
    <>
      <FormRow>
        <Field label="Identity provider sign-in URL" name="entryPoint" type="url" required placeholder="https://idp.acme.com/sso/saml" />
        <Field label="Identity provider entity ID" name="entityId" required placeholder="http://www.okta.com/exk…" />
      </FormRow>
      <TextArea label="Signing certificate (PEM)" name="cert" required placeholder="-----BEGIN CERTIFICATE-----" hint="Send the email as the NameID or as an email attribute." />
    </>
  );
}

/** Owners and admins: connect the company's identity provider. People sign in with it once the domain is proven. */
export function SsoForm({ orgId, reload, onClose }: { orgId: string; reload: () => void; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("oidc");
  const [error, setError] = useState<string | null>(null);
  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, String(x)]));
    void act(async () => {
      await auth((c) => c.sso.register(bodyOf(kind, orgId, v)));
      form.reset();
    }, reload).then((err) => (setError(err), err || onClose()));
  };
  return (
    <Modal title="Add an identity provider" onClose={onClose} wide>
      <form className="wl-form" onSubmit={send}>
        <FormRow>
          <SelectField label="Protocol" value={kind} options={KINDS} onChange={setKind} hint={kind === "oidc" ? "Okta, Entra ID, Google, Auth0, Keycloak." : "Any SAML 2.0 identity provider."} />
          <Field label="Provider id" name="providerId" required pattern="[a-z0-9][a-z0-9\-]{1,39}" placeholder="acme" hint="2 to 40 lowercase letters, digits, dashes." />
          <Field label="Email domain" name="domain" required placeholder="acme.com" hint="People with emails at this domain can use it." />
        </FormRow>
        {kind === "oidc" ? <OidcFields /> : <SamlFields />}
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <div className="wl-form-actions">
          <button type="button" className="wl-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="wl-btn wl-btn-primary">Add provider</button>
        </div>
      </form>
    </Modal>
  );
}
