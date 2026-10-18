# Deploy

WizeLens runs on the shared sparx AKS cluster (`aks-sparx-prod-cus`, group `rg-sparx-prod-cus`, region `centralus`) in its own `wizelens` namespace.

| Host | What | Service |
| --- | --- | --- |
| `wizelens.com` | Marketing site and docs (static files, nginx) | `site` |
| `www.wizelens.com`, `wizelens.dev`, `www.wizelens.dev` | 301 to `https://wizelens.com` (in Caddy) | none |
| `app.wizelens.com` | WizeLens Cloud | `cloud` |

## Where each piece lives

| Piece | Where |
| --- | --- |
| Key Vault, CI identity, roles | `sparx.works/terraform/bootstrap-azure/wizelens.tf` (a person applies it) |
| Postgres 18 server, generated secrets | `sparx.works/terraform/envs/azure/wizelens.tf` (the sparx release applies it) |
| TLS and routing | `sparx.works/k8s/ingress/Caddyfile` |
| TLS allow-list | `sparx.works/wizeworks/services/api-rest/src/routes/internal/domain-check.ts` |
| Public DNS (Cloudflare) | `sparx.works/terraform/modules/dns/wizelens.tf` |
| Workloads | this folder: `k8s/base`, `k8s/overlays/production`, `k8s/jobs` |
| Pipeline | `.github/workflows/deploy.yml`, after CI passes on `main` |

There is no Ingress object. The shared Caddy in `sparx-prod` sends traffic to the Services here.

## What a deploy does

1. Builds the site, then pushes `wizelens-cloud` and `wizelens-site` to GHCR, tagged `sha-<commit>`.
2. Signs in to Azure with GitHub OIDC. No password is stored in GitHub.
3. Reads the secrets from Key Vault into two Kubernetes Secrets: `cloud-env` (the app) and `db-admin` (the role Job only).
4. Runs the `db-role` Job, which makes the `wizelens_app` database role. The app migrates its own tables when it starts.
5. Applies the manifests with the images pinned to the commit, then waits for both rollouts.

The cloud runs one pod with `Recreate`, because migrations and alert jobs run inside the process. A deploy has a few seconds of downtime.

## First-time setup, in this order

1. **Bootstrap (a person, once).** From `sparx.works/terraform/bootstrap-azure`: `terraform apply -var="subscription_id=$(az account show --query id -o tsv)"`. It makes the vault, the identity, and the roles.
2. **Repository variables.** Run the four commands from `terraform output wizelens_github_setup` in that folder.
3. **Merge the sparx.works change.** Its release makes the Postgres server and writes every required secret into the vault, including `WIZELENS-CLOUD-AUTH-SECRET`. Terraform writes that one once and never changes it, because it encrypts 2FA secrets. To rotate it, set `2:<new>,1:<old>` in the vault.
4. **Merge to `main` here.** The Deploy workflow runs after CI.
5. **Make the two GHCR packages public**, once, after the first push: GitHub, Packages, `wizelens-cloud` and `wizelens-site`, Package settings, Change visibility. The cluster pulls without a pull secret, so until then the pods show `ImagePullBackOff`. Then run Deploy again from the Actions tab.
6. **DNS.** Move `wizelens.com` and `wizelens.dev` to Cloudflare, then set `wizelens_dns_enabled = true` in `sparx.works/terraform/envs/azure/ingress.tf`. The steps are in that variable's description.
7. **The first account.** Read the token, then open the cloud and use it:

   ```bash
   az keyvault secret show --vault-name kv-wizelens-prod-cus --name WIZELENS-CLOUD-SETUP-TOKEN --query value -o tsv
   ```

8. **Email with Resend.** Mail goes out as `WizeLens <hello@wizelens.com>` (`WIZELENS_CLOUD_MAIL_FROM` in the production overlay).
   1. In Resend, add the domain `wizelens.com` and put its DNS records in Cloudflare. Wait until Resend says it is verified.
   2. Make an API key with "Sending access" for that domain only, and store it:
      `az keyvault secret set --vault-name kv-wizelens-prod-cus --name WIZELENS-CLOUD-RESEND-API-KEY --value <re_...>`
   3. Add a webhook to `https://app.wizelens.com/_wizelens/api/mail/resend` with the events `email.bounced` and `email.complained`.
      Store its signing secret: `az keyvault secret set --vault-name kv-wizelens-prod-cus --name WIZELENS-CLOUD-RESEND-WEBHOOK-SECRET --value <whsec_...>`
   4. Run Deploy from the Actions tab. The log line `Mail        Resend` shows it is on.

## Secrets in `kv-wizelens-prod-cus`

Vault names cannot hold `_`, so `DATABASE_URL` is stored as `DATABASE-URL`.

| Name | Required | Who sets it |
| --- | --- | --- |
| `DATABASE-URL`, `DATABASE-ADMIN-URL`, `WIZELENS-APP-PASSWORD`, `WIZELENS-CLOUD-SETUP-TOKEN` | yes | Terraform |
| `WIZELENS-CLOUD-AUTH-SECRET` | yes | Terraform, once; never changed after that |
| `WIZELENS-CLOUD-RESEND-API-KEY` | no: without it (or SMTP) there is no password reset, invite, or alert email | a person |
| `WIZELENS-CLOUD-RESEND-WEBHOOK-SECRET` | no: without it, addresses that bounce keep getting mail | a person |
| `WIZELENS-CLOUD-SMTP-URL` | no: SMTP in place of Resend (never set both) | a person |
| `WIZELENS-CLOUD-SSO-ORIGINS` | no: without it there is no OIDC single sign-on | a person |

A deploy fails if a required secret is missing. After you add or change a secret, run Deploy from the Actions tab. The pod restarts only when the secrets change.

## Checks

```bash
kubectl -n wizelens get pods
kubectl -n wizelens logs deploy/cloud --tail=50
kubectl -n wizelens run curl --rm -it --restart=Never --image=curlimages/curl -- curl -s http://cloud/healthz
```
