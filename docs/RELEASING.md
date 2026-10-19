# Releasing

Every package is released by pushing a tag. Each family of packages has its own tag and its own version.

| Tag | Workflow | Publishes | Credentials |
|---|---|---|---|
| `v0.3.0` | `release.yml` | npm (`@wizeworks/lens-*`), NuGet (`WizeLens.*`), hub and cloud images on ghcr.io | Trusted publishing (OIDC); `NPM_TOKEN` only for a package's first publish |
| `python/v0.1.0a1` | `release-python.yml` | PyPI `wizelens` | Trusted publishing (OIDC), no stored token |
| `java/v0.1.0-alpha.1` | `release-java.yml` | Maven Central `com.wizelens:wizelens` | Repository secrets, below |
| `go/v0.1.0` | `release-go.yml` | Go module `github.com/brandonkorous/wizelens/go` | None: the tag is the release |

The tag must match the version in the package's own file: every `package.json` and `dotnet/Directory.Build.props`
for `v*` (`scripts/check-version.mjs`), `python/pyproject.toml` for `python/v*`, and `java/pom.xml` for `java/v*`
(`scripts/check-sdk-version.mjs`). A mismatch stops the workflow before anything is published.

```bash
git tag python/v0.1.0a1 && git push origin python/v0.1.0a1
```

Python versions follow PEP 440 (`0.1.0a1`, `0.1.0`), Java versions SemVer (`0.1.0-alpha.1`), and Go tags `vMAJOR.MINOR.PATCH`.
A version with a pre-release part makes a GitHub pre-release.

## One-time setup

### PyPI (trusted publishing)

1. Sign in to pypi.org and open **Your account → Publishing → Add a new pending publisher**.
2. PyPI project name `wizelens`, owner `brandonkorous`, repository `wizelens`, workflow `release-python.yml`,
   environment `pypi`.
3. In GitHub, **Settings → Environments → New environment** named `pypi`. Optional: require a reviewer, and allow only
   tags matching `python/v*`.

The first `python/v*` tag creates the project on PyPI. No token is stored anywhere.

### Maven Central

1. Sign in to central.sonatype.com and add the namespace `com.wizelens`. Verify it with the DNS TXT record it shows, on
   `wizelens.com`.
2. **View Account → Generate User Token**. Save the two values as repository secrets (**Settings → Secrets and variables →
   Actions**):
   - `MAVEN_CENTRAL_USERNAME`: the token's user name
   - `MAVEN_CENTRAL_PASSWORD`: the token's password
3. Make a signing key and publish its public half:
   ```bash
   gpg --quick-generate-key "WizeWorks LLC <security@wizelens.com>" ed25519 sign 3y
   gpg --keyserver keys.openpgp.org --send-keys <KEY_ID>
   gpg --armor --export-secret-keys <KEY_ID>      # the value of MAVEN_GPG_PRIVATE_KEY
   ```
   Then two more repository secrets:
   - `MAVEN_GPG_PRIVATE_KEY`: the armored private key, from `-----BEGIN PGP PRIVATE KEY BLOCK-----` to the end line
   - `MAVEN_GPG_PASSPHRASE`: its passphrase

The workflow uploads with the Central Portal plugin, which publishes on its own once validation passes. Try the release
build with no keys: `mvn -f java/pom.xml -P release verify -Dgpg.skip` (CI runs it on every pull request).

### Go

Nothing to create. The module path is `github.com/brandonkorous/wizelens/go`, so the repository must stay at
`github.com/brandonkorous/wizelens`; a tag `go/v0.1.0` is that module's `v0.1.0`. The workflow checks that `go.mod` is
tidy and the tests pass, then asks proxy.golang.org to fetch the version, which also lists it on pkg.go.dev. A `v2` or
later needs the module path to end in `/v2` first.
