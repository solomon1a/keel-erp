-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN "onlinePay" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesOrderLine" ADD COLUMN "taxGroupId" INTEGER;
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "taxGroupId" INTEGER;
ALTER TABLE "PosOrderLine" ADD COLUMN "taxGroupId" INTEGER;
ALTER TABLE "Attendance" ADD COLUMN "overtimeMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Attendance" ADD COLUMN "overtimeState" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CompanyTax" ADD COLUMN "accountCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TaxGroup" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "NumberSeries" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "document" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 4,
    "next" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumberSeries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentEntry" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unapplied" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL,
    "entryId" INTEGER,

    CONSTRAINT "PaymentEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentAllocation" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "entryId" INTEGER,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NumberSeries_companyId_document_key" ON "NumberSeries"("companyId", "document");
CREATE UNIQUE INDEX "PaymentEntry_companyId_name_key" ON "PaymentEntry"("companyId", "name");
CREATE UNIQUE INDEX "PaymentEntry_entryId_key" ON "PaymentEntry"("entryId");
CREATE INDEX "PaymentEntry_companyId_state_idx" ON "PaymentEntry"("companyId", "state");
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- AddForeignKey
ALTER TABLE "NumberSeries" ADD CONSTRAINT "NumberSeries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentEntry" ADD CONSTRAINT "PaymentEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentEntry" ADD CONSTRAINT "PaymentEntry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentEntry" ADD CONSTRAINT "PaymentEntry_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
