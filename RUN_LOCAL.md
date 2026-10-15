# Run Keel on a Mac

Node 26 and npm 11. The database is a local SQLite file. No account or API key is required.

From the unpacked project folder:

```bash
node -v
npm -v
cp .env.example .env
npm install
npx prisma generate
npm run db:reset
npm run dev
```

`cp` creates `.env` with `DATABASE_URL="file:./dev.db"`. That file is gitignored. `npm run db:reset` deletes any old `prisma/dev.db`, applies the schema, and loads Northline Goods. Run it again whenever the schema changes, including after this sign-in update. An older database has no password hashes, and `npm run dev` will not invent them.

`npm run dev` starts the API on port 43124 and the desk on port 43123.

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

Sign in with a demo account:

| Name | Role | Email | Password |
| --- | --- | --- | --- |
| Maya Chen | admin | maya@northline.example | keel-maya-desk |
| Jonah Ellis | user | jonah@northline.example | keel-jonah-desk |

Maya can open **People** to add an account or reset a password. **Password** changes the signed-in account. **Sign out** clears the session cookie. Stop both processes with Ctrl-C in that terminal.
