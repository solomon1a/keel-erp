# Manufacturing rules

These are the manufacturing rules Keel uses. They were studied from the way a production desk explodes a recipe, moves material into work in progress, and receives finished goods, then written here in Keel's own terms. The code is Keel's. Nothing from an upstream tree is copied.

A recipe says what one batch of a stocked product needs. A work order is a promise to make a quantity of that product. Stock and the ledger move only when material is issued or finished goods are received. Planning and drafting do not post journals.

## Bills of materials

A bill belongs to one company and one finished product. The same product can have several versions. One version is active. New work orders use the active version and keep the version they were opened with, so an older order does not change when the recipe is revised.

The yield is how many finished units the quantities describe. A component line is a stocked product and a quantity for that yield, plus an expected loss percent. The quantity to issue is the line quantity times `(1 + loss percent / 100)`, scaled by the order quantity divided by the yield. A line cannot name the finished product itself.

A bill can name operations in sequence. Each operation has a workstation and a number of hours for the yield, and its own expected loss percent. The workstation carries an hour rate. Operating cost for the yield is the sum of hours times the hour rate, inflated by that operation's loss percent.

A by-product is another stocked product the batch also produces, with a quantity for the yield. Its credit is that quantity times the by-product's current cost. It reduces the rolled-up unit cost. It is not received into stock until a work order records it.

Bills can point at other made products. The cost of a component that has its own active bill is that bill's rolled-up unit cost. A component with no bill uses the cost stored on the product. A cycle, where a bill eventually requires itself, contributes nothing further and does not loop.

Rolled-up unit cost is `(material + operating − by-product credit) / yield`, and it is never negative. Saving that cost writes it onto the finished product. Until then the product cost stays where it was.

## Work orders

A work order is make-to-stock, make-to-order, or subcontract. Make-to-order remembers the sales order it came from. A material request can be remembered the same way. The order stores the source warehouse, the finished-goods warehouse, the work-in-progress warehouse, and the scrap warehouse.

Statuses:

- **Not started.** Draft, or confirmed and not yet in the work-in-progress warehouse.
- **In process.** Material has been transferred, or production has started.
- **Completed.** The finished quantity has been received.
- **Stopped.** Held while in process. It can be started again. It cannot be finished while stopped.
- **Cancelled.** Allowed only before any finished quantity is received.

Confirming checks that the source warehouse can cover every component, including expected loss. It also opens one job card per operation. Starting without a work-in-progress warehouse only marks the order in process, which is the older path: components are still consumed from the source warehouse at the moment of production.

When a work-in-progress warehouse is set, starting transfers each remaining component from the source warehouse's shelf to the work-in-progress shelf. Both shelves are internal, so the transfer changes place and does not post a journal. The value is still in inventory.

## Receiving finished goods

Production can be partial. Each receipt takes a share of the components still outstanding. The last receipt takes whatever is left so rounding does not leave a scrap of quantity on the order.

Issuing a component out of an internal shelf into the production location is valued by the product's cost method. FIFO consumes the oldest open layers. Moving average uses the product's current average. Inventory is credited and work in progress is debited. That is the same perpetual-inventory rule as any other issue into production.

Time logged on job cards since the last receipt, times each workstation's hour rate, is operating cost. It is debited to work in progress and credited to accrued manufacturing labour, so the profit statement is unchanged and the balance sheet gains an asset and a matching liability.

Finished goods are received from the production location into the finished-goods warehouse. Their value is the material just issued, plus the operating cost just absorbed, minus scrap and process-loss amounts already relieved from work in progress. The unit cost on that receipt is that value divided by the quantity received. Inventory is debited and work in progress is credited. After a clean receipt, work in progress for that batch is clear.

## Job cards

A job card is one operation on one work order. It stores the planned quantity, the quantity completed, process loss, and rejected quantity. A time log is an operator name and a number of minutes. Completing a card does not by itself move stock. The work order receipt is what values the time.

## Planning

A production plan reads open sales orders, explodes the active bills, and nets each stocked product against internal quantity on hand. A made product with a bill becomes quantity to make. A bought component that is short becomes quantity to buy. Raising the plan opens work orders for what must be made and a material request for what must be bought. Doing that twice does not open a second set.

## Subcontracting

A subcontract order sends its components from the source warehouse to a subcontract location. That issue credits inventory and debits subcontracted goods. Receiving the finished quantity back values it at the material that was sent, divided by the quantity received, and credits subcontracted goods. No extra processing charge is posted in this slice.

## What this slice does not do

It does not schedule a finite capacity board, and it does not revalue older finished goods when a bill is revised. The product cost changes only when someone saves the rolled-up cost, or when a moving-average receipt updates it.
