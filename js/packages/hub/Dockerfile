# The WizeLens hub. Build from the repo root: docker build -f js/packages/hub/Dockerfile -t wizelens-hub .
FROM node:24-slim AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@wizeworks/lens-hub..." \
 && pnpm --filter "@wizeworks/lens-hub..." build \
 && pnpm --filter @wizeworks/lens-hub deploy --prod --legacy /out

FROM node:24-slim
LABEL org.opencontainers.image.title="WizeLens hub" \
      org.opencontainers.image.source="https://github.com/brandonkorous/wizelens" \
      org.opencontainers.image.licenses="MIT"
COPY --from=build /out /app
RUN mkdir /data && chown node:node /data
ENV NODE_ENV=production WIZELENS_HUB_HOST=0.0.0.0 WIZELENS_HUB_DATA=/data/hub.db
VOLUME /data
EXPOSE 5960
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:5960/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["node", "/app/dist/cli.js"]
