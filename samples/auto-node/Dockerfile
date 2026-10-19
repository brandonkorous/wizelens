# A plain image of the sample. It knows nothing about WizeLens; the Kubernetes webhook adds it.
FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
ENV PORT=5300
EXPOSE 5300
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.mjs"]
