# Accounting rules

These are the posting rules Keel uses. They were studied from the way a perpetual ERP keeps a general ledger, then written here in Keel's own terms. The engine is Keel's TypeScript and Prisma books. No upstream source is copied into this repository.

A journal entry is a set of lines. Each line is a debit or a credit on one account, optionally tagged with a partner and a cost centre. An entry is saved only when the debits equal the credits to the cent. Lines of zero are left off. An entry is never edited after it is saved. A correction is a new entry that reverses the effect.

## What each document posts

**Customer invoice.** Debit accounts receivable for the grand total. Credit sales income for the untaxed amount. Credit output tax for the tax. If a charges template added an amount, credit other income for that amount. The grand total is untaxed + tax + charge, and that is also the open residual.

**Customer credit note.** The same accounts, with the sides swapped.

**Vendor bill.** Debit inventory for the untaxed amount, debit input tax for the tax, and debit operating charges for a purchase charge. Credit accounts payable for the grand total. This is the bill. It is separate from the stock receipt, which credits goods-received-not-invoiced when the goods arrive. The two are not netted in this slice, so a billed receipt can sit in both inventory and the clearing account until a later matching project.

**Vendor debit note.** The bill, reversed.

**Payment.** A customer receipt debits the bank (or cash, when the method is cash) and credits receivable. A supplier payment debits payable and credits the bank. The invoice residual falls by the allocated amount. When the residual reaches zero the invoice is paid. A smaller amount leaves it posted and still open. The payment is its own journal entry, linked to the invoice, so the invoice entry itself stays as it was on the posting date.

**Reversal of a payment.** Undoing a match writes the payment entry backwards and puts the amount back on the residual. If the invoice had been paid, it returns to posted. The original payment entry stays in the ledger. The books stay an audit trail, and every entry, including the reversal, still balances.

## Reconciliation

A bank statement line has a signed amount. Money in is positive and can settle a customer invoice or a vendor debit note. Money out is negative and can settle a vendor bill or a customer credit note. The allocated amount cannot exceed what is still open on the line or on the invoice. One line can be split across invoices. The line is fully reconciled when the allocated total equals the absolute amount.

Releasing a match is the round trip: the payment reversal runs, the match row is removed, and the line's reconciled total drops by that amount. Both the invoice and the line are open again for the same money.

## Taxes and charges templates

Line tax is a rate on the untaxed line, stored on the invoice line. A charges template is a named percent of the whole untaxed amount, for sales or for purchases, not both. Applying it is allowed only on a draft. It stores the rate and the computed charge, and it rebuilds the grand total and the residual. Posting then adds the charge line described above. A template is never applied by itself to old invoices.

## Fiscal years and period closing

A fiscal year is a name plus a start and an end, belonging to one company. The open year for the calendar year is created with the company and again whenever the books are ensured, and a second run does not duplicate it or reopen a year that was closed.

Closing a year reads every income and expense line dated inside it. Income is credit minus debit. Expense is debit minus credit. The closing entry debits each income account for its balance and credits each expense account for its balance, and the difference goes to retained earnings. Income and expense for that range then net to zero, and the profit sits in equity. The year is marked closed. A later journal, payment, or stock valuation whose date falls inside a closed year is refused. Closing a year that is already closed is refused. A year with nothing to close is simply marked closed and posts no empty entry.

## Cost centres

A cost centre is a code and a name on the company. A draft invoice can be assigned one. Every line of the invoice's journal entry carries that centre. The centre does not change the amounts. A centre report sums the signed activity (income as credit minus debit, other accounts as debit minus credit) for lines that have a centre. Lines with no centre stay out of that report.

## Aging

Aging looks at posted invoices that still have a residual, with an invoice date on or before the as-of date. The age is the number of whole days from the invoice date to the as-of date. Current is 0–30 days, then 31–60, 61–90, and older. Customer invoices and vendor debit notes age as receivables. Vendor bills and customer credit notes age as payables. Each company sees only its own invoices.

## What this slice does not do

Multi-currency, deferred revenue, payment terms with instalments, and matching a vendor bill back against goods-received-not-invoiced are not in these rules. Lock dates still refuse a journal on or before the lock date, in addition to the closed-year check.
