# Changelog

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
