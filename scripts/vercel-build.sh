#!/bin/sh
set -e
prisma generate
prisma migrate deploy
echo "KEEL REFRESH: Jiangbei"
npx tsx prisma/refresh-jiangbei.ts
if [ "$KEEL_SEED_ON_BUILD" = "1" ]; then
  echo "KEEL SEED: starting prisma db seed"
  if prisma db seed; then
    echo "KEEL SEED: finished"
  else
    echo "KEEL SEED FAILED (exit $?) — deploy continues. Read the seed error above."
  fi
fi
npm run typecheck
vite build
npx esbuild server/vercel-handler.ts --bundle --platform=node --format=esm --packages=external --target=node20 --outfile=server-dist/handler.mjs
