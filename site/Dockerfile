# The marketing site image. Build the site first (pnpm --filter wizelens-site build), then: docker build -t wizelens-site site
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY out /usr/share/nginx/html
EXPOSE 8080
