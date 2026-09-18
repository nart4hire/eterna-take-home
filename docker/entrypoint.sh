#!/bin/sh
# StockFlow container entrypoint: validate configuration, migrate, seed, then serve.
set -e

case "${BETTER_AUTH_SECRET:-}" in
  "" | REPLACE_WITH*)
    echo "BETTER_AUTH_SECRET is missing or still the .env.example placeholder." >&2
    echo "Create .env from .env.example and set a generated secret before 'docker compose up'." >&2
    exit 1
    ;;
esac

pnpm db:migrate
# The seed is idempotent and refuses production mode, so run it in development mode.
NODE_ENV=development pnpm db:seed
exec pnpm start
