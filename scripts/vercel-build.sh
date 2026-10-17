#!/bin/sh
set -e
prisma generate
prisma migrate deploy
if [ "$KEEL_SEED_ON_BUILD" = "1" ]; then
  echo "KEEL SEED: starting prisma db seed"
  if prisma db seed; then
    echo "KEEL SEED: finished"
  else
    status=$?
    echo "KEEL SEED FAILED (exit ${status}) — deploy continues. Read the seed error above. Selling and buying demo documents were not fully applied."
  fi
fi
npm run typecheck
vite build
npx esbuild server/vercel-handler.ts --bundle --platform=node --format=esm --packages=external --target=node20 --outfile=server-dist/handler.mjs
