# Deploy Keel on Vercel

Keel on Vercel is one project. The Vite desk is static files. The Hono API is a Node function at `/api`, so the browser calls `/api` on the same origin and the session cookie is sent. The cookie is `Secure` when `NODE_ENV` is `production` or `VERCEL` is `1`.

Use **Neon** for Postgres. The Vercel Marketplace Neon integration is the same database with the connection strings filled in for you. The older “Vercel Postgres” product was moved to Neon; create a Neon database, not a new Vercel Postgres store.

Origin repositories are private. Vercel’s Origin integration is in public beta and is available on **Pro and Enterprise** teams. A Hobby team cannot deploy this repo. You need the Owner or Member role on the Vercel team.

## 1. Accounts you create yourself

1. A Cursor account that can open the Origin repo `vipesol/keel-erp` on branch `main`. If the team has not claimed a codebase yet, open [https://cursor.com/codebase/get-started](https://cursor.com/codebase/get-started) and finish that flow until the repo is listed.
2. A Vercel account on a **Pro or Enterprise** team.
3. A Neon account, unless you add Neon from the Vercel Marketplace in step 3.

## 2. Create the Neon database

In the [Neon console](https://console.neon.tech):

1. Create a project. For a partner in or near China, pick **AWS Asia Pacific (Singapore)** or the closest region Neon offers. Vercel has no mainland China region. In the Vercel project, set the function region to **Hong Kong (`hkg1`)** or **Singapore (`sin1`)** so it sits near that database.
2. Open **Connect**. Leave the branch, database, and role on the defaults.
3. Copy the connection string **with connection pooling on**. That is `DATABASE_URL`. It should use the `-pooler` host. Append these query parameters if they are missing: `sslmode=require&pgbouncer=true&connect_timeout=15&connection_limit=1`.
4. Turn connection pooling **off** and copy that string. That is `DIRECT_URL`. It must not use the pooler host. Keep `sslmode=require`. Do not add `pgbouncer=true` on this one.

Example shape (the host and password come from Neon):

```text
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15&connection_limit=1
DIRECT_URL=postgresql://USER:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Marketplace path instead of the Neon console: in the Vercel project, **Storage → Create → Neon** (or **Marketplace → Neon**). The integration writes `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct). Copy `DATABASE_URL_UNPOOLED` into a variable named `DIRECT_URL`. If the pooled URL has no `pgbouncer=true`, edit `DATABASE_URL` and add `&pgbouncer=true&connection_limit=1`.

A single non-pooled URL can be pasted into both variables for a first try. Serverless will open more connections that way. Prefer the pooler for `DATABASE_URL`.

## 3. Connect the Origin repo to Vercel

Documented by Vercel at [Deploying Origin repositories](https://vercel.com/docs/git/vercel-for-origin) and by Cursor at [https://cursor.com/codebase/get-started](https://cursor.com/codebase/get-started).

1. In the Vercel dashboard, choose **Add New… → Project**.
2. Choose **Continue with Origin**. Approve access if Cursor asks.
3. Choose the Origin team that owns `keel-erp`. Its repositories become available to the Vercel team selected in the dashboard.
4. Import `keel-erp`.
5. Root directory: the repository root.
6. Framework preset: **Vite**. Production branch: `main`.
7. Confirm the build matches `vercel.json` (the dashboard must not replace these):
   - Install command: `npm install` (this runs `postinstall`, which is `prisma generate`)
   - Build command: `prisma generate && npm run typecheck && vite build`
   - Output directory: `dist`
8. Add the environment variables in the next section **before** the first deploy. Apply them to **Production**. Use a second Neon branch for **Preview** if you want pull-request deploys; do not point Preview at the production database unless you are content for both to share the demo data.
9. Deploy.

You can also install Vercel from the repo’s **Apps** tab on Origin (codebase settings). That connects the same integration: preview deployments on pull requests, production on `main`.

`vercel.json` keeps the SPA fallback on `/index.html`. Requests to `/api` are a Node function (`api/[[...route]].ts`) and are matched before that rewrite. The function does not seed and does not run migrations.

## 4. Environment variables

Set these on the Vercel project for Production:

| Name | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon pooled URL, with `sslmode=require`, `pgbouncer=true`, and `connection_limit=1` |
| `DIRECT_URL` | yes | Neon direct URL, `sslmode=require`, no pooler |
| `SESSION_SECRET` | yes | At least 16 characters. Generate with `openssl rand -base64 32`. Do not reuse `keel-dev-session-secret-change-me` |

`NODE_ENV` and `VERCEL` are set by Vercel. Do not add a `PORT`. Changing `SESSION_SECRET` later signs everyone out.

The dev secret in `.env.example` is for your laptop only. Production login returns `SESSION_SECRET is not set.` when the variable is missing or shorter than 16 characters.

## 5. Migrate and seed once

Do this from your machine, against the production database, after the variables exist. Do **not** put seed or migrate in the Vercel build. A second deploy would try to insert the same demo rows and fail, and a reset would wipe the demo the partner is looking at.

```bash
cp .env.example .env
```

Edit `.env` so `DATABASE_URL` and `DIRECT_URL` are the **production** Neon URLs from step 2. Then:

```bash
npm install
npm run db:deploy
npm run db:seed
```

`db:deploy` is `prisma migrate deploy`. `db:seed` loads 江北良品 once. Seed is not idempotent. If it fails halfway, fix the error and run `npm run db:reset` only if you mean to drop that database’s schema and load the sample again.

Open the production URL Vercel shows (or the domain you attach). Sign in:

| Name | Role | Email | Password |
| --- | --- | --- | --- |
| Maya Chen | admin | maya@northline.example | keel-maya-desk |
| Jonah Ellis | user | jonah@northline.example | keel-jonah-desk |

The company is **江北良品**, Shanghai, CNY, VAT 13%. Maya is the admin. Jonah can sell and can close a register session only when the counted cash matches. Card, WeChat Pay, and Alipay on the register are recorded on the sale. Nothing is sent to a bank or a wallet.

## 6. What this deploy does not do

- It does not run on a Vercel Hobby team while the repo stays on Origin.
- It does not seed itself when the function cold-starts.
- It does not send email, issue a fapiao, or charge a card.
- Function duration is capped at 30 seconds (`vercel.json`). A normal request, including bcrypt on sign-in, is well under that.
- Neon’s free compute and storage limits, and Vercel’s plan limits, are whatever your accounts allow.
- Viewers in mainland China reach Hong Kong or Singapore, not a mainland host, so the first load can be slow.
- Preview deployments that reuse the production `DATABASE_URL` read and write the same demo. A reset from any machine using those URLs clears it.
