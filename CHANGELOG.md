# Changelog

## Groups, books, costing, views, and workflows

Access is no longer a single role string. Each company has Internal, Manager, and Settings groups, a read/write/create/delete grant on each model, and record rules. Settings bypasses those rules. An admin manages people, groups, and grants from Access rights. An internal user can work the lists and cannot delete them.

Bank statements import as date, label, amount. A line can be matched to an invoice in parts, and the match posts the same payment as Pay. Lock dates and tax lock dates refuse a journal, a payment, or a stock valuation on or before that day.

Stocked products use AVCO or FIFO. A receipt writes a valuation layer and debits inventory. An issue consumes the oldest FIFO layer, or the moving average, and posts cost of sales. Transfers can follow Receive → QC → store, or Pick → pack → ship. A transfer without a route still completes in one step.

Every desk list uses the same search, status filters, saved filters, group-by, kanban or table, and pages. Orders, manufacturing orders, transfers, and invoices follow a state machine. A record keeps a chatter log of who changed it and when.

Sales follow-ups, contact titles, putaway, work orders, register floors, shop pages, payslips, expense approvals, milestones, quality alerts, subcontract resupply, and helpdesk stages are on the menus, with sample rows in each company.

## HR, attendance, finance, procurement, and wastage

HR opens on a dashboard, the roster, departments, designations, an org chart, contracts, jobs, an applicant pipeline, onboarding, appraisals, leave types, leave requests, and approvals. Attendance is its own app: check-in, shifts, rosters, a monthly sheet, late, absent, overtime, a leave calendar, and reports. Finance keeps the invoices, bills, payments, journal, and chart, and adds bank and cash, budgets, cost centres, a cash-flow report, expenses, and a dashboard. Procurement keeps requests and orders, and adds requisitions, quotation comparison, approvals, goods receipt, vendor bills, and vendor scores. Wastage records scrap from the shelf and the shop floor, with a reason, a quantity, a cost, and an approval, plus reports by product, reason, and month. Each company in the seed has these rows. Each app still opens on a tile grid.

## App sections

Opening an app from the launcher shows that app’s sections as the same icon tiles. Sales opens on quotations, orders, customers, products, pricelists, reporting, and settings. Accounting opens on invoices, bills, payments, journal entries, the chart of accounts, reporting, and settings. A section that holds several pages, such as reports or the rest of configuration, opens another tile grid. The breadcrumb and the top menu still jump straight to a page.

Assets, Projects, Quality, Subcontracting, and Helpdesk stay on the launcher. There is no country compliance app.

## Module menus

Every app in the launcher now has an Odoo-style menu: orders, operations, products, reporting, and configuration, with a page behind each item. Lists search, filter, group, and switch between a table and a kanban where that fits. A row opens a form that saves. Reports draw a chart. Each module has a settings page. Records that are not part of the older books are sample rows stored per company. Running the seed again adds a missing row and leaves an edited setting alone.

## Launcher tiles

Contacts, Payroll, and Expenses each have their own tile, using the brand icon. Employees stays the roster. An admin and a regular user both see all thirteen apps. Posting payroll, paying a run, and approving an expense stay with the admin. People, in the header, stays admin-only.

## Keel brand

The desk uses the approved Keel look: teal `#0E6B5C`, Inter and Noto Sans SC, the keel mark in the header and on sign-in, and the module tiles on the launcher. Status chips use success, warning, danger, and info colors. A moon control in the header switches to the dark theme and remembers it. Lists keep one teal button for the new record; filters stay neutral.

## Signup and a fuller demo

The desk opens in English. **中文** still switches the interface, and that choice stays in the `keel_lang` cookie. `/start` creates a company: name, country (China, United Kingdom, United States, or somewhere else), the admin’s name, email, and password, and an optional sample notebook and quotation. The country sets currency, default tax, and the language of that first session. Signup is checked and limited to five tries an hour from one network address. An admin invites more people from People. A company with users is kept when the seed runs again; only an empty leftover company is removed.

The three demo companies now carry a fuller English book: more customers and vendors, quotations and orders in mixed states, purchase orders, manufacturing orders, stock moves, leads in every stage, invoices that are paid, unpaid, and overdue, a closed register beside the open one, shop orders, ten people, payroll for February, March, and April, and expenses that are submitted, approved, reimbursed, and refused. Re-running the seed adds a missing row and does not copy one that is already there.

## App launcher

Sign-in opens a grid of modules: Dashboard, Sales, CRM, Purchase, Inventory, Manufacturing, Point of Sale, eCommerce, Accounting, and Employees. Inside a module, the bar shows that module’s name and its own menu, with dropdowns where a section has more than one screen. Apps returns to the grid. Lists stay in memory after login, so moving between modules does not flash a loading page. Harbour & Line and Hudson Yard Goods now have a draft purchase, a bill of materials, a manufacturing order, a transfer, a register sale, and a second lead, in English.

## Payroll and English sample data

Jiangbei Goods Co. stays in Shanghai, in CNY, with 13% VAT and fapiao fields. Its name, contacts, products, warehouses, orders, pipeline, and staff records are in English. A database that already has 江北良品 is rewritten in place. Companies that are not Jiangbei, Harbour & Line, or Hudson Yard Goods are removed, so a partial seed cannot leave duplicates. The seed is safe to run again.

Staff now has payroll and expenses. Each company has a monthly gross, a posted April payslip, one reimbursed claim, and one claim still waiting. China uses sample social insurance, housing fund, and monthly individual income tax. The UK uses a flat PAYE and National Insurance estimate. The US uses a flat federal rate, FICA, and a flat New York state rate. These are demo approximations. Posting a run and reimbursing a claim write journal entries.

## Shop

Public catalog, product page, cart, and checkout. A guest or a shop account can place an order. It becomes a delivered sales order and takes stock from the online warehouse (上海仓 in the sample). WeChat Pay, Alipay, and card are recorded only. Sample account: 林晓, `lin@northline.example` / `keel-lin-shop`. Sample order SO0002 is a WeChat Pay blanket.

## Regions and phones

The seed can run again. 江北良品 stays if it is already there. Harbour & Line (Amira Shah, London, GBP, 20% VAT) and Hudson Yard Goods (Jordan Hale, New York, USD, 8.875% sales tax) are added when they are missing. Each login opens only that company, and money uses its currency. On a narrow screen the desk nav collapses behind a menu, and tables keep scrolling inside the page.

The Vercel build reads `DATABASE_URL_UNPOOLED` for migrations. The API handler is bundled to `server-dist/handler.mjs` because the Node runtime does not load the TypeScript import paths.

## Desk

The home page now reads across the company: open quotations, pipeline value, customer and vendor balances, shop orders, profit, VAT payable, active staff, and leave still waiting. The sample company shows ¥3,200 in open leads, ¥97.18 still owed on INV0001, and 周宁’s sick day.

## Staff

Departments, employees, a daily attendance mark (present, late, absent), and leave requests that stay waiting until someone approves or refuses them. 销售部 has 周宁, present on 14 April, with a sick day still waiting. 生产部 has 何工, with approved annual leave over 1–3 May.

## Pipeline

Leads sit on a kanban: new, qualified, proposition, won, lost. Each lead can hold a call, meeting, or to-do. Converting a live lead creates a customer (or reuses one with the same email) and an empty draft quotation. 陈薇’s tote opportunity is seeded in Qualified with a follow-up call. A lost lead is not converted.

## Accounting

Customer invoices, vendor bills, credit notes, and payments. A small China-style chart (现金, 银行, 应收, 库存, 应付, 销项税, 进项税, 收入, 成本) posts to journals. The general ledger, profit and loss, balance sheet, and VAT report read those entries. Invoices store buyer tax ID, fapiao number, and fapiao type for a printable layout. Nothing is sent to the Golden Tax or e-fapiao platform. INV0001 is the posted invoice for SO0002.
