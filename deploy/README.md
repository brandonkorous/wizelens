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
3. **Merge the sparx.works change.** Its release makes the Postgres server and writes `DATABASE-URL`, `DATABASE-ADMIN-URL`, `WIZELENS-APP-PASSWORD`, and `WIZELENS-CLOUD-SETUP-TOKEN` into the vault.
4. **The auth secret (a person, once).** It signs sessions and encrypts 2FA secrets, so Terraform never owns it:

   ```bash
   az keyvault secret set --vault-name kv-wizelens-prod-cus --name WIZELENS-CLOUD-AUTH-SECRET --value "$(openssl rand -hex 32)"
   ```

   Never replace it with a new value. To rotate, set `2:<new>,1:<old>`.
5. **Merge to `main` here.** The Deploy workflow runs after CI.
6. **Make the two GHCR packages public**, once, after the first push: GitHub, Packages, `wizelens-cloud` and `wizelens-site`, Package settings, Change visibility. The cluster pulls without a pull secret, so until then the pods show `ImagePullBackOff`. Then run Deploy again from the Actions tab.
7. **DNS.** Move `wizelens.com` and `wizelens.dev` to Cloudflare, then set `wizelens_dns_enabled = true` in `sparx.works/terraform/envs/azure/ingress.tf`. The steps are in that variable's description.
8. **The first account.** Read the token, then open the cloud and use it:

   ```bash
   az keyvault secret show --vault-name kv-wizelens-prod-cus --name WIZELENS-CLOUD-SETUP-TOKEN --query value -o tsv
   ```

## Secrets in `kv-wizelens-prod-cus`

Vault names cannot hold `_`, so `DATABASE_URL` is stored as `DATABASE-URL`.

| Name | Required | Who sets it |
| --- | --- | --- |
| `DATABASE-URL`, `DATABASE-ADMIN-URL`, `WIZELENS-APP-PASSWORD`, `WIZELENS-CLOUD-SETUP-TOKEN` | yes | Terraform |
| `WIZELENS-CLOUD-AUTH-SECRET` | yes | a person, once |
| `WIZELENS-CLOUD-SMTP-URL` | no: without it there is no password reset, invite, or alert email | a person |
| `WIZELENS-CLOUD-SSO-ORIGINS` | no: without it there is no OIDC single sign-on | a person |

A deploy fails if a required secret is missing. After you add or change a secret, run Deploy from the Actions tab. The pod restarts only when the secrets change.

## Checks

```bash
kubectl -n wizelens get pods
kubectl -n wizelens logs deploy/cloud --tail=50
kubectl -n wizelens run curl --rm -it --restart=Never --image=curlimages/curl -- curl -s http://cloud/healthz
```
