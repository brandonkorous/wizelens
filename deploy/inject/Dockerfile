# WizeLens auto install for Kubernetes: the injection webhook, and the files it copies into pods (/wizelens/node, /wizelens/dotnet).
# Build from the repo root: docker build -f deploy/inject/Dockerfile -t wizelens-inject .
FROM node:24-slim AS node
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@wizeworks/lens-node..." \
 && pnpm --filter "@wizeworks/lens-node..." build \
 && pnpm --filter @wizeworks/lens-node deploy --prod --legacy /out/node

# The .NET startup hook folder: WizeLens.AutoInstrumentation.dll with every dependency next to it, and the dashboard embedded.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS dotnet
WORKDIR /src
COPY dotnet ./dotnet
COPY --from=node /src/js/packages/ui/dist ./js/packages/ui/dist
WORKDIR /src/dotnet/src/WizeLens.AutoInstrumentation
RUN dotnet publish -c Release -o publish && rm -f publish/*.pdb

FROM node:24-alpine
LABEL org.opencontainers.image.title="WizeLens inject" \
      org.opencontainers.image.description="Adds WizeLens to Node and .NET pods labeled wizelens.dev/inject, with no code change." \
      org.opencontainers.image.source="https://github.com/brandonkorous/wizelens" \
      org.opencontainers.image.licenses="MIT"
COPY --from=node /out/node /wizelens/node
COPY --from=dotnet /src/dotnet/src/WizeLens.AutoInstrumentation/publish /wizelens/dotnet
COPY deploy/inject/webhook /app
ENV NODE_ENV=production
EXPOSE 8443
USER node
ENTRYPOINT ["node", "/app/server.mjs"]
