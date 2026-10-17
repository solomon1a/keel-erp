-- Guided demo progress for one company. Document ids are not foreign keys.

CREATE TABLE "DemoRun" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "serial" INTEGER NOT NULL,
    "leadId" INTEGER,
    "quotationId" INTEGER,
    "salesOrderId" INTEGER,
    "purchaseOrderId" INTEGER,
    "manufacturingOrderId" INTEGER,
    "invoiceId" INTEGER,
    "contactId" INTEGER,
    "finishedId" INTEGER,
    "componentId" INTEGER,
    "note" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemoRun_companyId_idx" ON "DemoRun"("companyId");

ALTER TABLE "DemoRun" ADD CONSTRAINT "DemoRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemoRun" ADD CONSTRAINT "DemoRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
