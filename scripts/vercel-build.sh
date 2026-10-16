#!/bin/sh
set -e
prisma generate
prisma migrate deploy
if [ "$KEEL_SEED_ON_BUILD" = "1" ]; then
  prisma db seed || echo skipped
fi
npm run typecheck
vite build
npx esbuild server/vercel-handler.ts --bundle --platform=node --format=esm --packages=external --target=node20 --outfile=server-dist/handler.mjs
