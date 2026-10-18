ALTER TABLE "StockLocation" ADD COLUMN "vendorId" INTEGER;

CREATE TABLE "AssetCategory" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "assetAccountId" INTEGER NOT NULL,
    "accumAccountId" INTEGER NOT NULL,
    "expenseAccountId" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Asset" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "purchaseValue" DOUBLE PRECISION NOT NULL,
    "salvageValue" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "invoiceLineId" INTEGER,
    "disposalDate" TIMESTAMP(3),
    "disposalPrice" DOUBLE PRECISION,
    "disposalEntryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetDepreciation" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "state" TEXT NOT NULL,
    "entryId" INTEGER,

    CONSTRAINT "AssetDepreciation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubcontractOrder" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "bomId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "state" TEXT NOT NULL,
    "received" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubcontractComponent" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "perUnit" DOUBLE PRECISION NOT NULL,
    "sent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valueSent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valueUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SubcontractComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubcontractReceipt" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "componentCost" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "invoiceId" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubcontractReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserInvite" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StockMove" ADD COLUMN "subcontractOrderId" INTEGER;

CREATE UNIQUE INDEX "AssetCategory_companyId_name_key" ON "AssetCategory"("companyId", "name");
CREATE UNIQUE INDEX "Asset_companyId_name_key" ON "Asset"("companyId", "name");
CREATE UNIQUE INDEX "Asset_invoiceLineId_key" ON "Asset"("invoiceLineId");
CREATE UNIQUE INDEX "Asset_disposalEntryId_key" ON "Asset"("disposalEntryId");
CREATE INDEX "Asset_companyId_state_idx" ON "Asset"("companyId", "state");
CREATE UNIQUE INDEX "AssetDepreciation_assetId_date_key" ON "AssetDepreciation"("assetId", "date");
CREATE UNIQUE INDEX "AssetDepreciation_entryId_key" ON "AssetDepreciation"("entryId");
CREATE UNIQUE INDEX "SubcontractOrder_companyId_name_key" ON "SubcontractOrder"("companyId", "name");
CREATE INDEX "SubcontractOrder_companyId_state_idx" ON "SubcontractOrder"("companyId", "state");
CREATE UNIQUE INDEX "SubcontractComponent_orderId_productId_key" ON "SubcontractComponent"("orderId", "productId");
CREATE UNIQUE INDEX "UserInvite_tokenHash_key" ON "UserInvite"("tokenHash");
CREATE INDEX "UserInvite_companyId_email_idx" ON "UserInvite"("companyId", "email");

ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_accumAccountId_fkey" FOREIGN KEY ("accumAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_disposalEntryId_fkey" FOREIGN KEY ("disposalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT "AssetDepreciation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT "AssetDepreciation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubcontractOrder" ADD CONSTRAINT "SubcontractOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubcontractOrder" ADD CONSTRAINT "SubcontractOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubcontractOrder" ADD CONSTRAINT "SubcontractOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubcontractOrder" ADD CONSTRAINT "SubcontractOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BillOfMaterials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubcontractOrder" ADD CONSTRAINT "SubcontractOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubcontractComponent" ADD CONSTRAINT "SubcontractComponent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SubcontractOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubcontractComponent" ADD CONSTRAINT "SubcontractComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubcontractReceipt" ADD CONSTRAINT "SubcontractReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SubcontractOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubcontractReceipt" ADD CONSTRAINT "SubcontractReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_subcontractOrderId_fkey" FOREIGN KEY ("subcontractOrderId") REFERENCES "SubcontractOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
