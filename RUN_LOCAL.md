# Run Keel on a Mac

Node 26 and npm 11. Keel needs Postgres. No payment account or API key is required for the desk itself.

From the project folder, start a database, then the app.

Docker (matches `.env.example`):

```bash
docker compose up -d
```

The first start creates `keel` and `keel_test`. `keel_test` is only for `npm test`.

Without Docker, install Postgres 16 (Postgres.app or `brew install postgresql@16`), start it, and create the same role and databases:

```bash
createuser -s keel
psql -d postgres -c "ALTER USER keel WITH PASSWORD 'keel';"
createdb -O keel keel
createdb -O keel keel_test
```

Or use a hosted dev database (a Neon branch is enough). Copy that project's pooled URL into `DATABASE_URL` and its direct URL into `DIRECT_URL`. On a single local server both URLs are the same. Tests read `KEEL_TEST_DATABASE_URL` when the default `keel_test` login does not match your machine.

```bash
node -v
npm -v
cp .env.example .env
npm install
npm run db:reset
npm run dev
```

`cp` creates `.env`. That file is gitignored. Edit the URLs if your Postgres user or host is different. `SESSION_SECRET` can stay as the example on your own machine. `npm install` runs `prisma generate`.

`npm run db:reset` clears the schema on `DIRECT_URL`, applies `prisma/migrations`, and loads the sample company. Run it again any time you want the demo data back. `npm run dev` applies migrations if they are pending, then starts the API. It seeds only when the company table is empty, so an older database is left as it is until you reset.

`npm run dev` starts the API on port 43124 and the desk on port 43123. The session cookie is not marked Secure on this http address. A production or Vercel process marks it Secure. See [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) for the hosted demo.

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

The desk opens in Simplified Chinese. Use **中文** / **EN** on the sign-in page or in the header to switch. The choice is stored in a `keel_lang` cookie in this browser.

Sign in with a demo account. The emails and passwords are unchanged:

| Name | Role | Email | Password |
| --- | --- | --- | --- |
| Maya Chen | admin | maya@northline.example | keel-maya-desk |
| Jonah Ellis | user | jonah@northline.example | keel-jonah-desk |

The sample company is **江北良品** in Shanghai. Money defaults to CNY (¥). The default tax is 增值税 at 13%. Maya can change the company name, currency code, and default tax rate on **Company**. Quotations and purchase orders show untaxed amount, tax, and the total. That page is not a fapiao; official Chinese VAT invoices are left for a later accounting slice.

**Purchases** drafts an RFQ (PO0001, PO0002, …). Maya and Jonah can create and send one. Only Maya (admin) can confirm it. The order picks a receiving warehouse; the sample uses 上海仓. Confirming opens an incoming receipt into that warehouse’s default shelf. **Receive** can take part of a line; **Receive all** takes the rest. A received order cannot be cancelled. **Print** opens the RFQ or purchase order for the browser print dialog.

**Vendors** lists contacts marked as suppliers (苏杭织造 and 青浦纱线 are in the sample, plus Brightmill Supply). **New vendor** opens a contact with the supplier flag already on. Products have a cost, a purchasable flag, a kind (finished goods or raw material), and optional lot or serial tracking. 羊毛纱 is tracked by lot. Only purchasable products can be put on a purchase order.

**Manufacturing** uses a bill of materials. The sample bill makes a canvas tote from 本色帆布 and 羊毛纱, and **MO0001** is a draft for 4 totes. Jonah can draft an order. Only Maya can confirm it. The order picks a source warehouse for components and a destination warehouse for finished goods; both default to 上海仓. Confirm names any component that is short on that source shelf. **Draft a purchase for the shortage** opens an RFQ with those quantities. After confirm, **Start**, then **Produce** (a partial quantity is allowed) or **Produce the rest**. On the bill, **Save as product cost** writes the component cost onto the product. **Print** works for the order and the bill.

**Stock** lists on-hand quantity per product per location and a cost valuation (on-hand times cost, internal shelves only). 上海仓 has 主库 and 成品区. 深圳门店 is the retail shop, with 店面. **Count** posts an adjustment on the location you pick. A lot-tracked product asks for a lot or serial number; that number is stored on the move, and the shelf still keeps one quantity per location. **Transfers** move stock between locations: draft, then **Mark ready**, then **Complete**. INT0001 is a draft for 2 field notebooks from 主库 to 店面. **Replenish** shows min/max rules. Canvas tote at 上海仓 is below its minimum of 5 (2 on hand, maximum 12), so the screen suggests making or buying 10. **Move history** is the full ledger, with product and location filters. Anyone signed in can manage warehouses, transfers, counts, and reorder rules. Sales deliveries, purchase receipts, and manufacturing orders still default to 上海仓.

**Register** sells from a shop session. SES0001 is already open at 深圳门店 with ¥200 opening cash. The shop shelf (店面) holds Field notebook (barcode 6901000000018, 7 left after POS0001), Wool blanket (6901000000025, 4), and Canvas tote (6901000000032, 3). Categories are 文具 and 家居. The register is a product grid with search and a barcode field: type or scan a code and press Enter. The cart takes a quantity, a discount, and an optional customer. Pay with cash (enter the amount received to see the change), card, WeChat Pay, or Alipay. Split a sale across more than one method. Those methods are only recorded. Nothing is sent to a bank or a wallet. A paid sale takes stock off 店面 and writes a stock move. **Receipt** opens an 80mm page for the browser print dialog, with CNY and 13% VAT. POS0001 is a walk-in notebook paid in cash (¥50 tendered, ¥29.66 change, total ¥20.34). **Orders** lists register sales. **Daily sales** totals one shop for one day. Jonah can sell and can close a session when the counted cash matches. Only Maya can close when it does not match, and only Maya can refund. A refund puts the goods back on 店面 and only works while the session is still open.

**People** adds accounts and resets passwords. **Password** changes the signed-in account. **Sign out** clears the session cookie. Stop both processes with Ctrl-C in that terminal.
