# Keel

Keel is a small operations desk for one company: contacts, quotations, and the stock room. It is a clean-room start on the plan in [docs/odoo-analysis/BUILD_OUR_OWN.md](docs/odoo-analysis/BUILD_OUR_OWN.md), not a copy of Odoo.

江北良品 is loaded the first time the database is empty: Shanghai, CNY, and 13% VAT, so you can click through a real quotation instead of an empty screen.

## Run it

On a Mac, follow [RUN_LOCAL.md](RUN_LOCAL.md). The database is Postgres (local or a hosted dev database). A partner demo on Vercel is [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).

```bash
cp .env.example .env
npm install
npm run db:reset
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). The desk and API listen on every interface (ports 43123 and 43124) so a cloud preview can reach them. Vite proxies `/api` to the API. On Vercel the desk is static and `/api` is the same Hono app, so the session cookie stays on one origin.

Sign in with email and password. The session is an httpOnly cookie, and it is marked Secure on HTTPS. Demo accounts are listed in [RUN_LOCAL.md](RUN_LOCAL.md). Maya Chen is an admin and can add people or reset passwords. Anyone signed in can change their own password.

To wipe the database in `DIRECT_URL` and load the sample company again:

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
- Company settings: name, one currency code (CNY by default), and the default tax rate. Another currency can be stored later; the desk still uses one code.
- English and Simplified Chinese on the desk. The **中文** / **EN** switch is remembered in a browser cookie.
- Confirming a sales order checks the warehouse on that order (上海仓 by default). Short stock is refused with the product name and the quantity on hand.
- Validating a delivery moves goods from that warehouse’s default shelf to customers and closes the order. A service-only order can be fulfilled without a stock move.
- Stock: several warehouses and locations, on-hand and cost valuation per location, counts, internal transfers (draft, ready, done), a move ledger, and reorder rules that suggest a purchase or a manufacturing order.
- Purchases: vendors are supplier contacts. An RFQ (draft) can be sent, then confirmed by an admin into a purchase order numbered PO0001. The order names a receiving warehouse. Confirming creates an incoming receipt. Receiving, including a partial quantity, adds stock to that warehouse’s default shelf. Print the RFQ or purchase order from the browser.
- Manufacturing: a finished product has a bill of materials (components per yield). Orders number MO0001. A user can draft one; an admin confirms it, and a short component is named with the quantity on hand at the source warehouse. Finishing consumes components there and adds finished goods to the destination warehouse. A partial quantity can be produced. Component cost can be saved onto the product. Print the order or the bill from the browser.
- Register: a shop session with opening cash, a touch product grid, barcode entry, and cash, card, WeChat Pay, and Alipay recorded on the sale (no gateway). Split payments. Stock leaves the shop shelf. Refunds, admin only while the session is open, put it back. Close records counted cash and the difference. An 80mm receipt, a sales list, and a daily report per shop.
- Online shop: a public catalog, product page, cart, and guest or account checkout. The order lands in Sales and stock leaves the online warehouse. WeChat Pay, Alipay, and card are recorded only.
- A printable quotation page, and a printable purchase page. Use the browser print dialog if you want a PDF.
- Sign-in with a bcrypt password hash, an httpOnly session cookie, sign-out, a change-password page, and an admin screen to create users and reset passwords. Roles are `admin` or `user`.

## What this slice leaves out

Email delivery, a generated PDF file, fapiao and the rest of accounting, CRM, multi-level manufacturing routes, more than one currency at once, and a live card or wallet gateway. Lot and serial numbers are recorded on the stock move; quantities are not split by lot. WeChat Pay and Alipay on the register are payment methods on the sale, not connections to those networks. Roles are stored and checked for the people screen and for confirming a purchase or a manufacturing order; later modules can read the same `admin` or `user` value. The app stores data in Postgres. Local setup is in [RUN_LOCAL.md](RUN_LOCAL.md), and the Vercel demo is in [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).

## REA

This repo also registers [REA](https://github.com/morluto/rea) for Cursor cloud agents.

- MCP config: `.cursor/mcp.json` (`npx -y rea-agents@latest mcp`)
- VM setup notes: `.cursor/environment.json` (Node 22.19+ or 24.11+, and a procps `ps`)
- What was verified: [VERIFICATION.md](VERIFICATION.md)
- Optional Ghidra setup: [GHIDRA_SETUP.md](GHIDRA_SETUP.md)
- Odoo architecture notes: [docs/odoo-analysis/](docs/odoo-analysis/)

Only analyze software you own or are allowed to examine.
