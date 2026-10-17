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

Or use a hosted dev database (a Neon branch is enough). Copy that project's pooled URL into `DATABASE_URL` and its direct URL into `DATABASE_URL_UNPOOLED`. On a single local server both URLs are the same. Tests read `KEEL_TEST_DATABASE_URL` when the default `keel_test` login does not match your machine.

```bash
node -v
npm -v
cp .env.example .env
npm install
npm run db:reset
npm run dev
```

`cp` creates `.env`. That file is gitignored. Edit the URLs if your Postgres user or host is different. `SESSION_SECRET` can stay as the example on your own machine. `npm install` runs `prisma generate`.

`npm run db:reset` clears the schema on `DATABASE_URL_UNPOOLED`, applies `prisma/migrations`, and loads the sample companies. Run it again any time you want the demo data back. `npm run dev` applies migrations if they are pending, then starts the API. Seeding again skips a company that is already there and adds any demo company that is missing.

`npm run dev` starts the API on port 43124 and the desk on port 43123. The session cookie is not marked Secure on this http address. A production or Vercel process marks it Secure. See [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) for the hosted demo.

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

The desk opens in English. Use **中文** / **EN** on the sign-in page or in the header to switch. The choice is stored in a `keel_lang` cookie in this browser. A new business can open its own company at `/start`.

Sign in with a demo account. Each person lands in their own company:

| Name | Company | Role | Email | Password |
| --- | --- | --- | --- | --- |
| August | Jiangbei Goods Co. | admin | maya@northline.example | keel-maya-desk |
| Jonah Ellis | Jiangbei Goods Co. | user | jonah@northline.example | keel-jonah-desk |
| Amira Shah | Harbour & Line | admin | amira@harbourline.example | keel-amira-desk |
| Jordan Hale | Hudson Yard Goods | admin | jordan@hudsonyard.example | keel-jordan-desk |

The public shop is [http://127.0.0.1:43123/shop](http://127.0.0.1:43123/shop). Field notebook, Wool blanket, and Canvas tote are published. Checkout writes a sales order and takes stock from Shanghai Warehouse. Payments are recorded as WeChat Pay, Alipay, or card. Shop account: Lin Xiao, `lin@northline.example` / `keel-lin-shop`. SO0002 is her seeded blanket order. **Accounting** shows INV0001 for that order, already posted, with a sample fapiao number that has not been filed. **Pipeline** starts with Chen Wei’s tote lead (qualified, a follow-up call) and Zhao Lei’s restock enquiry. **Staff** lists Sales (Zhou Ning, present on 14 April, a sick day still waiting) and Production (He Gong, annual leave 1–3 May already approved). The home page adds those up: ¥3,200 of open leads, ¥97.18 still owed on INV0001, one leave request waiting. April payroll for Zhou Ning is posted with demo deductions, and a Shanghai Metro fare is already reimbursed, so profit is below the sales figure.

**Jiangbei Goods Co.** is Shanghai, CNY, and 13% VAT. **Harbour & Line** is London, GBP, and 20% VAT. **Hudson Yard Goods** is New York, USD, and 8.875% sales tax. Amounts follow the company you signed into. An admin can change that company's name, currency code, and default tax rate on **Company**. Quotations and purchase orders show untaxed amount, tax, and the total. That page is not a fapiao; official Chinese VAT invoices are left for a later accounting slice.

**Purchases** drafts an RFQ (PO0001, PO0002, …). August and Jonah can create and send one. Only August (admin) can confirm it. The order picks a receiving warehouse; the sample uses Shanghai Warehouse. Confirming opens an incoming receipt into that warehouse’s default shelf. **Receive** can take part of a line; **Receive all** takes the rest. A received order cannot be cancelled. **Print** opens the RFQ or purchase order for the browser print dialog.

**Vendors** lists contacts marked as suppliers (Suhang Weaving and Qingpu Yarn are in the sample, plus Brightmill Supply). **New vendor** opens a contact with the supplier flag already on. Products have a cost, a purchasable flag, a kind (finished goods or raw material), and optional lot or serial tracking. Wool yarn is tracked by lot. Only purchasable products can be put on a purchase order.

**Manufacturing** uses a bill of materials. The sample bill makes a canvas tote from Greige canvas and Wool yarn, and **MO0001** is a draft for 4 totes. Jonah can draft an order. Only August can confirm it. The order picks a source warehouse for components and a destination warehouse for finished goods; both default to Shanghai Warehouse. Confirm names any component that is short on that source shelf. **Draft a purchase for the shortage** opens an RFQ with those quantities. After confirm, **Start**, then **Produce** (a partial quantity is allowed) or **Produce the rest**. On the bill, **Save as product cost** writes the component cost onto the product. **Print** works for the order and the bill.

**Stock** lists on-hand quantity per product per location and a cost valuation (on-hand times cost, internal shelves only). Shanghai Warehouse has Main stock and Finished goods. Shenzhen Store is the retail shop, with Shop floor. **Count** posts an adjustment on the location you pick. A lot-tracked product asks for a lot or serial number; that number is stored on the move, and the shelf still keeps one quantity per location. **Transfers** move stock between locations: draft, then **Mark ready**, then **Complete**. INT0001 is a draft for 2 field notebooks from Main stock to Shop floor. **Replenish** shows min/max rules. Canvas tote at Shanghai Warehouse is below its minimum of 5 (2 on hand, maximum 12), so the screen suggests making or buying 10. **Move history** is the full ledger, with product and location filters. Anyone signed in can manage warehouses, transfers, counts, and reorder rules. Sales deliveries, purchase receipts, and manufacturing orders still default to Shanghai Warehouse.

**Register** sells from a shop session. SES0001 is already open at Shenzhen Store with ¥200 opening cash. The shop shelf (Shop floor) holds Field notebook (barcode 6901000000018, 7 left after POS0001), Wool blanket (6901000000025, 4), and Canvas tote (6901000000032, 3). Categories are Stationery and Home. The register is a product grid with search and a barcode field: type or scan a code and press Enter. The cart takes a quantity, a discount, and an optional customer. Pay with cash (enter the amount received to see the change), card, WeChat Pay, or Alipay. Split a sale across more than one method. Those methods are only recorded. Nothing is sent to a bank or a wallet. A paid sale takes stock off Shop floor and writes a stock move. **Receipt** opens an 80mm page for the browser print dialog, with CNY and 13% VAT. POS0001 is a walk-in notebook paid in cash (¥50 tendered, ¥29.66 change, total ¥20.34). **Orders** lists register sales. **Daily sales** totals one shop for one day. Jonah can sell and can close a session when the counted cash matches. Only August can close when it does not match, and only August can refund. A refund puts the goods back on Shop floor and only works while the session is still open.

**People** adds accounts and resets passwords. **Password** changes the signed-in account. **Sign out** clears the session cookie. Stop both processes with Ctrl-C in that terminal.
