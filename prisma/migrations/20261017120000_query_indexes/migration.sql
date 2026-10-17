-- Indexes for company lists, dated reports, and journal lines.
CREATE INDEX "SalesOrder_companyId_dateOrder_idx" ON "SalesOrder"("companyId", "dateOrder");
CREATE INDEX "SalesOrder_companyId_updatedAt_idx" ON "SalesOrder"("companyId", "updatedAt");
CREATE INDEX "PurchaseOrder_companyId_dateOrder_idx" ON "PurchaseOrder"("companyId", "dateOrder");
CREATE INDEX "Invoice_companyId_invoiceDate_idx" ON "Invoice"("companyId", "invoiceDate");
CREATE INDEX "Invoice_companyId_state_moveType_idx" ON "Invoice"("companyId", "state", "moveType");
CREATE INDEX "JournalItem_entryId_idx" ON "JournalItem"("entryId");
CREATE INDEX "LeaveRequest_employeeId_state_idx" ON "LeaveRequest"("employeeId", "state");
CREATE INDEX "DeskRecord_companyId_module_screen_state_idx" ON "DeskRecord"("companyId", "module", "screen", "state");
CREATE INDEX "DeskRecord_companyId_recordDate_idx" ON "DeskRecord"("companyId", "recordDate");
