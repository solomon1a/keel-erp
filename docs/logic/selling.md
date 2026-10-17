# Selling rules

These are the selling rules Keel uses. They were studied from the way an open-source ERP walks a sale from a quote through delivery, an invoice, and a payment, then written here in Keel's own terms. The code is Keel's. Nothing from an upstream tree is copied.

A sale is a chain of documents. Each one keeps its own lines. The sales order remembers, per line, how many have been delivered and how many have been billed. Those two numbers are what the status is read from.

## Documents

**Quotation.** A quotation is its own document, addressed to one customer. Sending it does not move stock and does not post a journal. Confirming it creates a draft sales order with the same lines and marks the quotation ordered. The older desk can still open a draft sales order directly and confirm that. Both paths end at the same sales order.

**Sales order.** Confirming a draft or sent order checks that stocked products are on the shelf for the full quantity, then writes a draft stock move from the warehouse to the customer location for each stocked line. A service line is marked delivered for its whole quantity at confirm, because there is nothing to ship. The order state becomes a sales order. It stays there until every stocked line has been delivered, and only then moves to done.

**Delivery note.** Delivering completes draft stock moves, in full or for a smaller quantity. A smaller quantity splits the leftover back into a new draft move, the same way a partial receipt does on the buy side. Each delivery writes a delivery note, links the completed moves to it, and adds the quantity to the line's delivered total. Stock and cost of goods are posted by the existing valuation: an issue out of the warehouse credits inventory and debits cost of goods, at FIFO layers or at the product's average cost.

**Sales invoice.** Billing reads what is still uninvoiced on each line, which may be more or less than what has been delivered. A caller can name the lines and quantities, or leave that out and bill whatever is still open. The invoice line points back at the sales order line, and the billed quantity goes up. An older invoice that was raised for the whole order and has no line link still blocks a second invoice, so a shop order that was billed once cannot be billed again. Posting uses the existing customer-invoice journal: debit receivable, credit income, credit output tax.

**Payment.** A payment allocates an amount to one posted invoice, up to what is still open. The residual falls. A partial payment leaves the invoice posted. When the residual reaches zero the invoice is paid. The cash or bank entry is the one already used for customer receipts. Aging still reads posted customer invoices that have a residual. A credit note does not reduce that receivable total; it ages on the payable side and it does reduce the receivable account in the ledger.

## Status

With at least one line:

- **To deliver and bill** — something stocked is still undelivered, and something is still unbilled.
- **To bill** — delivery is finished, billing is not.
- **To deliver** — billing is finished, delivery is not.
- **Completed** — both are finished.
- **Nothing** — the order has no lines.

## Price and credit

The catalog list price is the starting point. A price list can hold quantity breaks for a product. The break with the highest minimum that the quantity still meets replaces the list price.

A pricing rule then applies on top. Rules are sales or purchase, optionally limited to a product, a minimum quantity, one customer, a customer group, or one vendor. A customer match outranks a group match, and a group match outranks a rule with no customer. Within the same rank, the higher minimum quantity wins. A fixed price replaces the unit price and clears any discount. Otherwise the rule's percent is the discount on the break or list price.

A credit limit of zero means the customer is not checked. On confirm, when the limit is above zero, exposure is the residual of posted customer invoices plus this order's total. The confirm is refused when that exposure is over the limit.

## Returns

A return starts from a posted customer invoice and names a quantity per line, up to what was invoiced and not already returned. It writes a credit note linked as a reversal of that invoice and posts it, which swaps the invoice journal. For a stocked line it also receives the goods back from the customer location into the warehouse. That receipt is valued like any customer return: inventory is debited and cost of goods is credited.

## What this slice does not do

Multi-currency, instalment payment terms, and automatic application of a price list onto an order the user has already priced by hand are not in these rules. The order form still stores the unit price it was given. The pricing endpoint is there when a screen or a later call wants a resolved price.
