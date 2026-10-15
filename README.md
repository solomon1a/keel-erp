# Keel

Keel is a small operations desk for one company: contacts, quotations, and the stock room. It is a clean-room start on the plan in [docs/odoo-analysis/BUILD_OUR_OWN.md](docs/odoo-analysis/BUILD_OUR_OWN.md), not a copy of Odoo.

江北良品 is loaded the first time the database is empty: Shanghai, CNY, and 13% VAT, so you can click through a real quotation instead of an empty screen.

## Run it

On a Mac, follow [RUN_LOCAL.md](RUN_LOCAL.md). Otherwise:

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). The desk and API listen on every interface (ports 43123 and 43124) so a cloud preview can reach them. Vite proxies `/api` to the API.

Sign in with email and password. The session is an httpOnly cookie. Demo accounts are listed in [RUN_LOCAL.md](RUN_LOCAL.md). Maya Chen is an admin and can add people or reset passwords. Anyone signed in can change their own password.

To wipe the local database and load the sample company again:

```bash
npm run db:reset
```

Tests:

```bash
npm test
```

## What works

- Contacts: companies and people, search, customer / supplier / employee flags, address, notes, and who created the record.
- Products: goods and services, SKU, list price, cost, a purchasable flag, and finished goods or raw material.
- Quotations: lines, discount, a configurable tax rate, and totals that show untaxed amount, tax, and the price including tax. Mark sent, confirm, cancel. This is not a fapiao.
- Company settings: name, one currency code (CNY by default), and the default tax rate. Another currency can be stored later; the desk still uses one code.
- English and Simplified Chinese on the desk. The **中文** / **EN** switch is remembered in a browser cookie.
- Confirming checks the shelf. Short stock is refused with the product name and the quantity on hand.
- Validating a delivery moves goods from main stock to customers and closes the order. A service-only order can be fulfilled without a stock move.
- Stock: on-hand counts, receipts (positive adjustment), write-offs (negative), and recent moves.
- Purchases: vendors are supplier contacts. An RFQ (draft) can be sent, then confirmed by an admin into a purchase order numbered PO0001. Confirming creates an incoming receipt. Receiving, including a partial quantity, adds stock to main stock and links the moves to the purchase. Print the RFQ or purchase order from the browser.
- Manufacturing: a finished product has a bill of materials (components per yield). Orders number MO0001. A user can draft one; an admin confirms it, and a short component is named with the quantity on hand. Finishing consumes components from main stock and adds the finished goods. A partial quantity can be produced. Component cost can be saved onto the product. Print the order or the bill from the browser.
- A printable quotation page, and a printable purchase page. Use the browser print dialog if you want a PDF.
- Sign-in with a bcrypt password hash, an httpOnly session cookie, sign-out, a change-password page, and an admin screen to create users and reset passwords. Roles are `admin` or `user`.

## What this slice leaves out

Email delivery, a generated PDF file, fapiao and the rest of accounting, CRM, multi-level manufacturing routes, more than one currency at once, and more than one warehouse. Roles are stored and checked for the people screen and for confirming a purchase or a manufacturing order; later modules can read the same `admin` or `user` value. The database is SQLite (`prisma/dev.db`) so the app runs without Postgres. The schema is Prisma, so a later Postgres URL is a configuration change, not a rewrite.

## REA

This repo also registers [REA](https://github.com/morluto/rea) for Cursor cloud agents.

- MCP config: `.cursor/mcp.json` (`npx -y rea-agents@latest mcp`)
- VM setup notes: `.cursor/environment.json` (Node 22.19+ or 24.11+, and a procps `ps`)
- What was verified: [VERIFICATION.md](VERIFICATION.md)
- Optional Ghidra setup: [GHIDRA_SETUP.md](GHIDRA_SETUP.md)
- Odoo architecture notes: [docs/odoo-analysis/](docs/odoo-analysis/)

Only analyze software you own or are allowed to examine.
