#!/bin/sh
set -e
npx prisma generate
npx prisma migrate deploy
if [ "$KEEL_SEED_ON_BUILD" = "1" ]; then npx prisma db seed || echo "Seed skipped (database already has data)"; fi
npm run typecheck
npx vite build
npx esbuild server/vercel-handler.ts --bundle --platform=node --format=esm --packages=external --target=node20 --outfile=server-dist/handler.mjs
