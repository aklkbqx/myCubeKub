FROM oven/bun:1-alpine AS base

WORKDIR /app

# Install deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY . .

# Run
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
