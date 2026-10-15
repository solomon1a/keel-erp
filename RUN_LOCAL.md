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

`cp` creates `.env` with `DATABASE_URL="file:./dev.db"`. That file is gitignored. `npm run db:reset` creates `prisma/dev.db`, applies the schema, and loads the Northline Goods sample (Maya Chen, Jonah Ellis, contacts, products, and draft order SO0001). `npm run dev` starts the API on port 43124 and the desk on port 43123.

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

On the sign-in screen, choose Maya Chen or Jonah Ellis. Stop both processes with Ctrl-C in that terminal.
