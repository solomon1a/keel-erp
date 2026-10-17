# Buying rules

These are the buying rules Keel uses. They were studied from the way an open-source ERP walks a purchase from a request through a receipt, a vendor bill, and a payment, then written here in Keel's own terms. The code is Keel's. Nothing from an upstream tree is copied.

## Documents

**Material request.** Someone asks for a product and a quantity. Confirming the request does not buy anything and does not move stock. It is the list the quotations are compared against.

**Supplier quotation.** A vendor quotes a unit cost for the requested goods. Two or more quotations on the same request can be compared by product, lowest cost first. Choosing one creates a draft purchase order for that vendor's lines and confirms it, which writes the draft receipt moves. The request's ordered quantity goes up, and the request is ordered once every line is covered.

**Purchase order.** Confirming a draft or sent order writes a draft stock move from the supplier location into the warehouse for each stocked line. The order stays a purchase until every draft receipt is done, and only then becomes done. Cancelling is refused once any receipt has been completed.

**Purchase receipt.** Receiving completes draft moves for the quantity given, and splits any remainder into a new draft move. The receipt records the quantity and the order line's unit cost, links the moves, and adds the quantity to the line's received total. Valuation is the existing receipt: inventory is debited, goods-received-not-invoiced is credited, at the order line's unit cost. Average cost is rebuilt from that receipt. A landed cost posted against the receipt adds to the newest open positive layer, debits inventory, and credits the landed-cost clearing account.

**Vendor bill.** This is the three-way match. A stocked line can be billed only up to what has been received and not yet billed. A service can be billed up to what was ordered and not yet billed. Asking for more than that, or billing when nothing is receivable yet, is refused until the goods are received. The bill line points at the purchase order line and the billed quantity goes up. Posting uses the existing vendor-bill journal: debit inventory, debit input tax, credit payable. That bill is not netted against goods-received-not-invoiced. A received and billed purchase can sit in both inventory and the clearing account, which is the same choice the accounting rules already record.

**Payment.** A supplier payment allocates an amount up to the open residual, debits payable, and credits the bank. A partial payment leaves the bill posted.

## Status

The purchase order uses the same reading as a sale, with received in place of delivered and billed in place of invoiced: still to receive and bill, to bill only, to receive only, or completed.

## Returns

A purchase return starts from a posted vendor bill and names a quantity per line. It writes a debit note linked as a reversal of that bill and posts it, which reverses the bill journal (credit inventory, debit payable). It also issues the goods from the warehouse back to the supplier. That issue credits inventory and debits cost of goods. The debit note credits inventory as well. Both entries balance on their own. Inventory is credited twice, once by the stock issue and once by the debit note, which matches the decision not to net the bill against the receipt.

## What this slice does not do

Multi-currency, instalment terms, and matching a vendor bill back against goods-received-not-invoiced are not in these rules.
