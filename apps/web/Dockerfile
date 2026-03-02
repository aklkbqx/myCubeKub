FROM --platform=$BUILDPLATFORM oven/bun:1-alpine AS build

WORKDIR /app/apps/web
COPY apps/web/package.json apps/web/bun.lock* ./
COPY packages/api-contract /app/packages/api-contract
RUN bun install --frozen-lockfile
COPY apps/web ./
RUN bunx vite build

FROM --platform=$TARGETPLATFORM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
