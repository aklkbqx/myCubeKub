FROM oven/bun:1-alpine AS base

WORKDIR /app

RUN apk add --no-cache docker-cli docker-cli-compose

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY . .

EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
