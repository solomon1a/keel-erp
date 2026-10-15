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

`cp` creates `.env` with `DATABASE_URL="file:./dev.db"`. That file is gitignored. `npm run db:reset` deletes any old `prisma/dev.db`, applies the schema, and loads the sample company. Run it again after this update. An older database is missing purchase orders, product cost, and the sample vendors; `npm run dev` will not rewrite that seed.

`npm run dev` starts the API on port 43124 and the desk on port 43123.

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

The desk opens in Simplified Chinese. Use **中文** / **EN** on the sign-in page or in the header to switch. The choice is stored in a `keel_lang` cookie in this browser.

Sign in with a demo account. The emails and passwords are unchanged:

| Name | Role | Email | Password |
| --- | --- | --- | --- |
| Maya Chen | admin | maya@northline.example | keel-maya-desk |
| Jonah Ellis | user | jonah@northline.example | keel-jonah-desk |

The sample company is **江北良品** in Shanghai. Money defaults to CNY (¥). The default tax is 增值税 at 13%. Maya can change the company name, currency code, and default tax rate on **Company**. Quotations and purchase orders show untaxed amount, tax, and the total. That page is not a fapiao; official Chinese VAT invoices are left for a later accounting slice.

**Purchases** drafts an RFQ (PO0001, PO0002, …). Maya and Jonah can create and send one. Only Maya (admin) can confirm it. Confirming opens an incoming receipt from vendors into main stock. **Receive** can take part of a line; **Receive all** takes the rest. A received order cannot be cancelled. **Print** opens the RFQ or purchase order for the browser print dialog.

**Vendors** lists contacts marked as suppliers (苏杭织造 and 青浦纱线 are in the sample, plus Brightmill Supply). **New vendor** opens a contact with the supplier flag already on. Products have a cost, a purchasable flag, and a kind: finished goods or raw material (本色帆布, 羊毛纱). Only purchasable products can be put on a purchase order. Raw materials are stocked now; manufacturing is later.

**People** adds accounts and resets passwords. **Password** changes the signed-in account. **Sign out** clears the session cookie. Stop both processes with Ctrl-C in that terminal.
