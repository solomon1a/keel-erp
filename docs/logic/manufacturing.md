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

A production plan reads open sales orders, and, when the company settings say so, demand forecasts and reorder rules. It explodes the active bills and nets each stocked product against internal quantity on hand. A made product with a bill becomes quantity to make. A bought component that is short becomes quantity to buy. Each line keeps the source (sales order, forecast, reorder, or a mix) and a lead time in days. A made product uses the lead stored on the product. A bought product uses its own lead, or the default purchase lead from manufacturing settings when that lead is zero.

A forecast is a quantity of one product in one calendar month. It is not a sales order and it does not post. The planning horizon, in days, drops sales orders and forecast months that start after today plus that many days. Zero means no cutoff.

A reorder rule adds demand only for a product the orders and forecasts did not already ask for, and only when on-hand is below the minimum. The quantity is the maximum minus on-hand.

Raising the plan opens work orders for what must be made and a material request for what must be bought. Doing that twice does not open a second set. Drafting purchase orders is a separate step. Those drafts use an explicit name and do not take the next purchase-order number. They stay drafts until someone confirms them.

## Downtime and OEE

A downtime entry belongs to one work center. Draft minutes are a record only. When the downtime setting is on, confirmed minutes shorten the scheduled day in proportion: availability is logged time against one full day, multiplied by the share of the day that was not down. Zero downtime leaves the previous ratio. A work center with no logged time and no completed or rejected quantity still has no OEE. Turning the setting off ignores downtime.

## Unbuild

An unbuild order names a finished product that has an active bill, and a quantity. While it is a draft, stock does not move. Marking it done issues the finished good from the internal shelf into production and receives each component back, at the component's current cost, for the bill quantity divided by the yield. Expected loss is not returned, because that material was never in the finished piece. By-products are not reversed.

## Reports and bill tools

Production analysis sums finished quantity by month. Work in progress is the remaining quantity on orders that are in process or stopped, valued at the product cost. Cost variance is the rolled-up bill cost of the quantity finished, compared with component issues at current cost plus operating cost already absorbed. Work center utilisation is logged minutes against one scheduled day, and it also shows confirmed downtime. Scrap and wastage reuse the wastage entries already stored on the orders.

Comparing two bills lists each component quantity on the left and the right, and the rolled-up unit cost of each bill. Exploding a bill walks every level until a bought item or a cycle. Saving the rolled-up cost writes that unit cost onto the product. It does not revalue finished goods already in stock.

## Settings that change the workshop

Locking confirmed orders blocks edits. The default work center is required when an order is confirmed. The planning horizon, forecast switch, reorder switch, downtime switch, and default purchase lead each change the plan or the OEE figure, as described above. A blank setting uses the same default the settings screen shows.

## Subcontracting

A subcontract order sends its components from the source warehouse to a subcontract location. That issue credits inventory and debits subcontracted goods. Receiving the finished quantity back values it at the material that was sent, divided by the quantity received, and credits subcontracted goods. No extra processing charge is posted in this slice.

## What this slice does not do

It does not schedule a finite capacity board, and it does not revalue older finished goods when a bill is revised. The product cost changes only when someone saves the rolled-up cost, or when a moving-average receipt updates it. Planning does not post journals. A draft unbuild does not either.
