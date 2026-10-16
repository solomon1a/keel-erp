# Inventory rules

These are the stock and valuation rules Keel uses. They were studied from perpetual inventory practice, then written here in Keel's own terms. The code is Keel's. Nothing from an upstream tree is copied into this repository.

Stock on hand lives in quantities at locations. A move that finishes takes quantity off the source location and puts it on the destination. Only a move that crosses the boundary of internal stock changes inventory value. A move between two internal locations is a transfer: the quantity changes place and the value does not.

## Stock ledger

Every valued move appends a stock ledger row for that product and company: quantity in, quantity out, the signed value of this move, and the running quantity and running value after the move. The running figures are the previous row plus this one. Receipts add value. Issues subtract the cost that was consumed. The ledger is append-only.

## Receipts

A receipt into internal stock is valued at the incoming unit cost times the quantity. The incoming cost is the purchase line when the move belongs to a purchase, otherwise the cost stored on the product at that moment. The ledger row is positive. A valuation layer is stored with that quantity still remaining, that unit cost, and the value.

The journal debits inventory. The credit depends on where the goods came from:

- a supplier, or another non-internal location that is not a customer return and not production: goods received not invoiced
- production: work in progress
- a customer (a return): cost of sales

Moving average then recomputes the product cost as `(quantity before × previous average + receipt value) / quantity after`. FIFO leaves the product cost where it is and relies on the layers.

## Issues and the two cost methods

An issue out of internal stock credits inventory and debits cost of sales, or work in progress when the destination is production.

**FIFO.** Open layers are consumed oldest first. The cost is the sum of quantity taken from each layer times that layer's unit cost. A layer's remaining quantity falls by what was taken. If the issue is larger than the open layers, the uncovered quantity uses the product cost as a fallback.

**Moving average.** The issue is valued at the product's current average times the quantity. Open layers are still reduced oldest first so the remaining quantity agrees with stock, but they do not set the cost. The average itself changes only on a receipt or a landed cost.

The ledger stores the issue as quantity out and a negative value.

## Stock reconciliation

A count names a product, an internal location, and the quantity that was counted. The difference from the quantity on hand is an adjustment move: a positive difference is a receipt from the supplier location, a negative difference is an issue to the adjustment location. That move is valued by the rules above, so a count posts a stock ledger row and a balanced journal. A count that matches on hand posts nothing.

## Batches and serials

A product tracks nothing, a batch, or a serial.

A batch is a name on the product with a quantity. A valued receipt that carries a batch name increases that quantity. A valued issue decreases it, and refuses to go below zero. An adjustment of a tracked product already requires the name before the move is saved. A move that has no name, such as a manufacturing consumption that did not capture one, does not change batch quantities.

A serial is a unique name in the company. It moves one unit at a time. A receipt creates it as in stock at the destination. A second receipt of the same name is refused. An issue marks it issued and clears the location. Issuing a serial that is not in stock is refused.

Internal transfers do not rewrite batch or serial records in this slice, because they are not valued moves.

## Reorder

A reorder rule is a minimum and a maximum for a product in a warehouse. When on-hand is below the minimum, the product is short and the suggested quantity is the maximum minus on-hand. The rule does not create a purchase by itself.

## Landed cost

Landed cost is an extra amount, such as freight, absorbed by the newest open receipt layer. The layer's value grows by that amount and its unit cost becomes the new value divided by the original quantity. Remaining quantity is unchanged. Inventory is debited and a landed-cost clearing account is credited, for that amount, as its own balanced entry. Under moving average, the product cost is rebuilt from whatever quantity is still open on every layer, using the updated unit cost of the layer that absorbed the charge.

## Perpetual inventory

Valuation and the journal are written in the same transaction as the stock move. There is no separate period-end stock entry for these moves. If the move's date falls in a closed fiscal year, or on or before a lock date, the valuation is refused and the move is not half-posted.
