-- Shop floor: bill versions, routing, job cards, wastage, and subcontract links.

DROP INDEX "BillOfMaterials_productId_key";

ALTER TABLE "BillOfMaterials" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "BillOfMaterials" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "BillOfMaterials_productId_version_key" ON "BillOfMaterials"("productId", "version");
CREATE INDEX "BillOfMaterials_companyId_active_idx" ON "BillOfMaterials"("companyId", "active");

ALTER TABLE "BomLine" ADD COLUMN "lossPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "Workstation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "hourRate" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "Workstation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workstation_companyId_name_key" ON "Workstation"("companyId", "name");

CREATE TABLE "BomOperation" (
    "id" SERIAL NOT NULL,
    "bomId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "workstationId" INTEGER NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "lossPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "BomOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BomByproduct" (
    "id" SERIAL NOT NULL,
    "bomId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "BomByproduct_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ManufacturingOrder" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'stock';
ALTER TABLE "ManufacturingOrder" ADD COLUMN "salesOrderId" INTEGER;
ALTER TABLE "ManufacturingOrder" ADD COLUMN "materialRequestId" INTEGER;
ALTER TABLE "ManufacturingOrder" ADD COLUMN "supplierId" INTEGER;
ALTER TABLE "ManufacturingOrder" ADD COLUMN "subcontractState" TEXT;
ALTER TABLE "ManufacturingOrder" ADD COLUMN "transferred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ManufacturingOrder" ADD COLUMN "operatingAbsorbed" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ManufacturingOrder" ADD COLUMN "relieved" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ManufacturingOrder" ADD COLUMN "quantityRejected" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ManufacturingOrder" ADD COLUMN "wipWarehouseId" INTEGER;
ALTER TABLE "ManufacturingOrder" ADD COLUMN "scrapWarehouseId" INTEGER;

ALTER TABLE "ManufacturingComponent" ADD COLUMN "lossPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "StockMove" ADD COLUMN "unitCost" DOUBLE PRECISION;

CREATE TABLE "JobCard" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "operationName" TEXT NOT NULL,
    "workstationId" INTEGER,
    "plannedQty" DOUBLE PRECISION NOT NULL,
    "completedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "processLoss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rejectedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    CONSTRAINT "JobCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobCard_companyId_name_key" ON "JobCard"("companyId", "name");
CREATE INDEX "JobCard_orderId_idx" ON "JobCard"("orderId");

CREATE TABLE "JobTimeLog" (
    "id" SERIAL NOT NULL,
    "jobCardId" INTEGER NOT NULL,
    "operatorName" TEXT NOT NULL,
    "minutes" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    CONSTRAINT "JobTimeLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WastageEntry" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "jobCardId" INTEGER,
    "productId" INTEGER NOT NULL,
    "workstationId" INTEGER,
    "operationName" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "expectedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WastageEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WastageEntry_companyId_kind_idx" ON "WastageEntry"("companyId", "kind");

CREATE TABLE "ProductionPlan" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionPlan_companyId_name_key" ON "ProductionPlan"("companyId", "name");

CREATE TABLE "ProductionPlanLine" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "demandQty" DOUBLE PRECISION NOT NULL,
    "onHand" DOUBLE PRECISION NOT NULL,
    "toMake" DOUBLE PRECISION NOT NULL,
    "toBuy" DOUBLE PRECISION NOT NULL,
    "bomId" INTEGER,
    "workOrderId" INTEGER,
    "materialRequestId" INTEGER,
    CONSTRAINT "ProductionPlanLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BomOperation" ADD CONSTRAINT "BomOperation_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BillOfMaterials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BomOperation" ADD CONSTRAINT "BomOperation_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BomByproduct" ADD CONSTRAINT "BomByproduct_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BillOfMaterials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BomByproduct" ADD CONSTRAINT "BomByproduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "MaterialRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_wipWarehouseId_fkey" FOREIGN KEY ("wipWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_scrapWarehouseId_fkey" FOREIGN KEY ("scrapWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobTimeLog" ADD CONSTRAINT "JobTimeLog_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WastageEntry" ADD CONSTRAINT "WastageEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WastageEntry" ADD CONSTRAINT "WastageEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WastageEntry" ADD CONSTRAINT "WastageEntry_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WastageEntry" ADD CONSTRAINT "WastageEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WastageEntry" ADD CONSTRAINT "WastageEntry_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionPlan" ADD CONSTRAINT "ProductionPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionPlanLine" ADD CONSTRAINT "ProductionPlanLine_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProductionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
