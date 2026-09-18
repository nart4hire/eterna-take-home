# StockFlow application image: production build served by `next start`.
# Node and pnpm mirror mise.toml so the container matches local development.
FROM node:24.21.0-bookworm-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN corepack enable && corepack prepare pnpm@12.4.2 --activate

WORKDIR /app

# Dependencies first so source edits do not invalidate the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Generates the Prisma client and builds the app; no database is needed for this step.
RUN pnpm build

ENV NODE_ENV=production

EXPOSE 3000

# docker/entrypoint.sh validates configuration, migrates, seeds and serves.
CMD ["sh", "docker/entrypoint.sh"]
