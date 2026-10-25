-- AlterTable
ALTER TABLE "Product" ADD COLUMN "leadDays" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ProductionPlanLine" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'order';
ALTER TABLE "ProductionPlanLine" ADD COLUMN "leadDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductionPlanLine" ADD COLUMN "purchaseOrderId" INTEGER;

-- CreateTable
CREATE TABLE "DemandForecast" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandForecast_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DowntimeEntry" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "workstationId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "minutes" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DowntimeEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UnbuildOrder" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "bomId" INTEGER,
    "quantity" DOUBLE PRECISION NOT NULL,
    "warehouseId" INTEGER,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnbuildOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemandForecast_companyId_name_key" ON "DemandForecast"("companyId", "name");
CREATE INDEX "DemandForecast_companyId_period_idx" ON "DemandForecast"("companyId", "period");
CREATE UNIQUE INDEX "DowntimeEntry_companyId_name_key" ON "DowntimeEntry"("companyId", "name");
CREATE INDEX "DowntimeEntry_workstationId_idx" ON "DowntimeEntry"("workstationId");
CREATE UNIQUE INDEX "UnbuildOrder_companyId_name_key" ON "UnbuildOrder"("companyId", "name");
CREATE INDEX "UnbuildOrder_companyId_state_idx" ON "UnbuildOrder"("companyId", "state");

-- AddForeignKey
ALTER TABLE "ProductionPlanLine" ADD CONSTRAINT "ProductionPlanLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DemandForecast" ADD CONSTRAINT "DemandForecast_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemandForecast" ADD CONSTRAINT "DemandForecast_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DowntimeEntry" ADD CONSTRAINT "DowntimeEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DowntimeEntry" ADD CONSTRAINT "DowntimeEntry_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnbuildOrder" ADD CONSTRAINT "UnbuildOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnbuildOrder" ADD CONSTRAINT "UnbuildOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnbuildOrder" ADD CONSTRAINT "UnbuildOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BillOfMaterials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
