# Wastage rules

These are the wastage rules Keel uses. They were studied from the way a factory records process loss, scrap, and rejected quantity against a job, then written here in Keel's own terms. The code is Keel's. Nothing from an upstream tree is copied.

Wastage is a quantity that was issued to a work order and did not become good finished goods. It is recorded on the work order, and it can name the job card whose operation caused it. The record stores the product, the quantity, a reason, the workstation when there is one, and the cost.

## Three kinds

**Expected loss** is the percent already on the bill of materials, on a component or on an operation. The extra quantity is issued with the batch. Its cost stays inside the finished goods, because the good units carry the normal loss. The wastage report still shows that expected percent so a later loss can be compared with it. Expected loss does not post its own journal.

**Process loss** is quantity that disappeared: it is not a stocked scrap item. The cost is the quantity times the unit cost named on the record. Work in progress is credited and the wastage expense is debited. That cost is relieved from work in progress before the finished-goods receipt, so it is not also absorbed into the good units.

**Scrap** is a stocked item, including a by-product offcut or a rejected finished unit. The quantity moves from the production location into the scrap warehouse. The receipt is valued at the unit cost on the record. Inventory at the scrap warehouse is debited and work in progress is credited. Rejected quantity is scrap of this kind, and the work order remembers how many units were rejected.

Scrap and process loss are allowed while the order is in process or stopped. They are refused once the order is completed or still not started, because there is no work in progress to relieve.

## Reports

The wastage report reads the recorded rows. It does not scan the whole journal. From those rows it groups:

- by item, with quantity and cost
- by operation and workstation
- by reason
- the actual quantity against the expected loss on the bill, as a percent
- the cost of wastage, split between expense (process loss) and stock still held as scrap

A read of the report does not create rows and does not post.

## Ledger

Every posting is a balanced pair.

- Process loss: debit wastage expense, credit work in progress.
- Scrap and rejected units: debit inventory, credit work in progress, for the scrap value. The units sit in the scrap warehouse.
- The finished-goods receipt then credits work in progress only for what remains: material issued, plus operating cost, minus these reliefs.

If the scrap value and the process-loss cost together exceed the material and operating cost absorbed so far, the receipt is refused rather than driving work in progress negative.

## What this slice does not do

It does not ask a second person to approve a wastage row, and it does not write a wastage row for a stock count. A shelf count still uses the stock adjustment, which posts inventory and cost of sales. Floor wastage is only the loss recorded on a work order or a job card.
