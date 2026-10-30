# The WizeLens cloud service. Build from the repo root: docker build -f js/packages/cloud/Dockerfile -t wizelens-cloud .
FROM node:24-slim AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@wizeworks/lens-cloud..." \
 && pnpm --filter "@wizeworks/lens-cloud..." build \
 && pnpm --filter @wizeworks/lens-cloud deploy --prod --legacy /out

FROM node:24-slim
LABEL org.opencontainers.image.title="WizeLens Cloud" \
      org.opencontainers.image.source="https://github.com/wizeworksllc/wizelens" \
      org.opencontainers.image.licenses="MIT"
COPY --from=build /out /app
RUN mkdir /data && chown node:node /data
ENV NODE_ENV=production PORT=5970 DATABASE_URL=pglite:/data/cloud
VOLUME /data
EXPOSE 5970
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:5970/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["node", "/app/dist/cli.js"]
