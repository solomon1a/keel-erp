# Keel

Keel is a multi-tenant operations desk: contacts, quotations, stock, and the books, with one company per business. It is a clean-room start on the plan in [docs/odoo-analysis/BUILD_OUR_OWN.md](docs/odoo-analysis/BUILD_OUR_OWN.md), not a copy of Odoo. The interface uses the Keel brand: teal `#0E6B5C`, Inter and Noto Sans SC, and a dark theme from the header. The launcher opens each app on a grid of its sections. A section that holds several pages opens another grid. The breadcrumb and the top menu still jump straight to a page.

Open `/start` to create a company. The country sets the currency, default tax, and the language of that first session. The person who signs up is the admin and can invite more people. Optional sample data adds a notebook, a customer, a vendor, and a draft quotation. Every staff request is limited to that company.

Three demo companies load with the seed. Jiangbei Goods Co. is Shanghai, CNY, and 13% VAT. Harbour & Line is London, GBP, and 20% VAT. Hudson Yard Goods is New York, USD, and 8.875% sales tax. Each person belongs to one company, and amounts on their desk use that currency. Running the seed again fills in anything those demos are missing, rewrites Jiangbei records that are still in Chinese, and deletes only companies that have no users. A company created from `/start` stays.

## Run it

On a Mac, follow [RUN_LOCAL.md](RUN_LOCAL.md). The database is Postgres (local or a hosted dev database). A partner demo on Vercel is [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).

```bash
cp .env.example .env
npm install
npm run db:reset
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). The desk and API listen on every interface (ports 43123 and 43124) so a cloud preview can reach them. Vite proxies `/api` to the API. On Vercel the desk is static and `/api` is the same Hono app, so the session cookie stays on one origin.

Sign in with email and password. The session is an httpOnly cookie, and it is marked Secure on HTTPS. Demo accounts:

| Company | Name | Role | Email | Password |
| --- | --- | --- | --- | --- |
| Jiangbei Goods Co. | Maya Chen | admin | maya@northline.example | keel-maya-desk |
| Jiangbei Goods Co. | Jonah Ellis | user | jonah@northline.example | keel-jonah-desk |
| Jiangbei Goods Co. shop | Lin Xiao | shop | lin@northline.example | keel-lin-shop |
| Harbour & Line | Amira Shah | admin | amira@harbourline.example | keel-amira-desk |
| Harbour & Line shop | Priya Nair | shop | priya@harbourline.example | keel-priya-shop |
| Hudson Yard Goods | Jordan Hale | admin | jordan@hudsonyard.example | keel-jordan-desk |
| Hudson Yard Goods shop | Sam Ortiz | shop | sam@hudsonyard.example | keel-sam-shop |

Maya, Amira, and Jordan are admins and can add people or reset passwords inside their own company. Anyone signed in can change their own password. The public shop at `/shop` is Jiangbei Goods Co. Staff includes payroll and expenses. Deduction rules are a labelled demo approximation for China, the UK, and New York.

To wipe the database in `DATABASE_URL_UNPOOLED` and load the sample companies again:

```bash
npm run db:reset
```

Tests:

```bash
npm test
```

## What works

- Contacts: companies and people, search, customer / supplier / employee flags, address, notes, and who created the record.
- Products: goods and services, SKU, list price, cost, a purchasable flag, finished goods or raw material, and an optional lot or serial flag.
- Quotations: lines, discount, a configurable tax rate, and totals that show untaxed amount, tax, and the price including tax. Mark sent, confirm, cancel. This is not a fapiao.
- Company settings: name, one currency code for that company (CNY, GBP, or USD in the demos), and the default tax rate. Amounts follow the signed-in company.
- English and Simplified Chinese on the desk. English is the default. The **中文** / **EN** switch is remembered in a browser cookie.
- Self-serve signup at `/start`. A new business gets its own company, books, warehouse, and admin. Signup is validated and limited to five attempts an hour from one address.
- Confirming a sales order checks the warehouse on that order (Shanghai Warehouse by default). Short stock is refused with the product name and the quantity on hand.
- Validating a delivery moves goods from that warehouse’s default shelf to customers and closes the order. A service-only order can be fulfilled without a stock move.
- Stock: several warehouses and locations, on-hand and cost valuation per location, counts, internal transfers (draft, ready, done), a move ledger, and reorder rules that suggest a purchase or a manufacturing order.
- Purchases: vendors are supplier contacts. An RFQ (draft) can be sent, then confirmed by an admin into a purchase order numbered PO0001. The order names a receiving warehouse. Confirming creates an incoming receipt. Receiving, including a partial quantity, adds stock to that warehouse’s default shelf. Print the RFQ or purchase order from the browser.
- Manufacturing: a finished product has a bill of materials (components per yield). Orders number MO0001. A user can draft one; an admin confirms it, and a short component is named with the quantity on hand at the source warehouse. Finishing consumes components there and adds finished goods to the destination warehouse. A partial quantity can be produced. Component cost can be saved onto the product. Print the order or the bill from the browser.
- Register: a shop session with opening cash, a touch product grid, barcode entry, and cash, card, WeChat Pay, and Alipay recorded on the sale (no gateway). Split payments. Stock leaves the shop shelf. Refunds, admin only while the session is open, put it back. Close records counted cash and the difference. An 80mm receipt, a sales list, and a daily report per shop.
- Online shop: a public catalog, product page, cart, and guest or account checkout. The order lands in Sales and stock leaves the online warehouse. WeChat Pay, Alipay, and card are recorded only.
- Invoices and bills from sales, purchases, and the register, with payments, credit notes, a small China-style chart of accounts, journals, a general ledger, profit and loss, a balance sheet, and a VAT report. The printable invoice has fapiao fields and says it is not filed with the Golden Tax platform.
- Pipeline: leads and opportunities on a kanban, activities, and a button that turns a live lead into a draft quotation.
- Staff: departments, employees, daily attendance, and leave that can be approved or refused.
- Home: open orders, pipeline value, unpaid customer and vendor balances, shop orders, profit, VAT payable, staff, and leave still waiting.
- A printable quotation page, and a printable purchase page. Use the browser print dialog if you want a PDF.
- Sign-in with a bcrypt password hash, an httpOnly session cookie, sign-out, a change-password page, and an admin screen to create users and reset passwords. Roles are `admin` or `user`.

## What this slice leaves out

Email delivery, a generated PDF file, Golden Tax / e-fapiao submission, multi-level manufacturing routes, more than one currency at once, and a live card or wallet gateway. Lot and serial numbers are recorded on the stock move; quantities are not split by lot. WeChat Pay and Alipay on the register are payment methods on the sale, not connections to those networks. Roles are stored and checked for the people screen and for confirming a purchase or a manufacturing order; later modules can read the same `admin` or `user` value. The app stores data in Postgres. Local setup is in [RUN_LOCAL.md](RUN_LOCAL.md), and the Vercel demo is in [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).

## REA

This repo also registers [REA](https://github.com/morluto/rea) for Cursor cloud agents.

- MCP config: `.cursor/mcp.json` (`npx -y rea-agents@latest mcp`)
- VM setup notes: `.cursor/environment.json` (Node 22.19+ or 24.11+, and a procps `ps`)
- What was verified: [VERIFICATION.md](VERIFICATION.md)
- Optional Ghidra setup: [GHIDRA_SETUP.md](GHIDRA_SETUP.md)
- Odoo architecture notes: [docs/odoo-analysis/](docs/odoo-analysis/)

Only analyze software you own or are allowed to examine.
