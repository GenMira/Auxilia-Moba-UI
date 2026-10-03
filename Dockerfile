FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build

FROM nginx:stable-alpine AS runtime
RUN apk add --no-cache ca-certificates
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf.template /etc/nginx/app.conf.template
COPY deploy/start.sh /app/start.sh
RUN chmod 755 /app/start.sh
ENV PORT=8080
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
ENTRYPOINT ["/bin/sh", "/app/start.sh"]
