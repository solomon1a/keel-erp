-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "lockDate" TIMESTAMP(3),
ADD COLUMN     "taxLockDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "costMethod" TEXT NOT NULL DEFAULT 'avco';

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "routeId" INTEGER,
ADD COLUMN     "step" TEXT;

-- CreateTable
CREATE TABLE "AccessGroup" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AccessGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelAccess" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ModelAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordRule" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "RecordRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedFilter" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL DEFAULT '',
    "groupBy" TEXT NOT NULL DEFAULT 'none',
    "state" TEXT NOT NULL DEFAULT 'all',

    CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatterMessage" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "recordId" INTEGER NOT NULL,
    "userId" INTEGER,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatterMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" SERIAL NOT NULL,
    "statementId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "lineDate" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reconciled" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconcileMatch" (
    "id" SERIAL NOT NULL,
    "lineId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ReconcileMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationLayer" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "moveId" INTEGER,
    "quantity" DOUBLE PRECISION NOT NULL,
    "remaining" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "entryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValuationLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockRoute" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "steps" TEXT NOT NULL,

    CONSTRAINT "StockRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessGroup_companyId_key_key" ON "AccessGroup"("companyId", "key");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelAccess_groupId_model_key" ON "ModelAccess"("groupId", "model");

-- CreateIndex
CREATE INDEX "RecordRule_groupId_model_idx" ON "RecordRule"("groupId", "model");

-- CreateIndex
CREATE INDEX "SavedFilter_companyId_idx" ON "SavedFilter"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedFilter_userId_model_name_key" ON "SavedFilter"("userId", "model", "name");

-- CreateIndex
CREATE INDEX "ChatterMessage_companyId_model_recordId_idx" ON "ChatterMessage"("companyId", "model", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_companyId_name_key" ON "BankStatement"("companyId", "name");

-- CreateIndex
CREATE INDEX "BankStatementLine_companyId_idx" ON "BankStatementLine"("companyId");

-- CreateIndex
CREATE INDEX "ReconcileMatch_companyId_invoiceId_idx" ON "ReconcileMatch"("companyId", "invoiceId");

-- CreateIndex
CREATE INDEX "ValuationLayer_companyId_productId_idx" ON "ValuationLayer"("companyId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockRoute_companyId_name_key" ON "StockRoute"("companyId", "name");

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "StockRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGroup" ADD CONSTRAINT "AccessGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccessGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelAccess" ADD CONSTRAINT "ModelAccess_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccessGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordRule" ADD CONSTRAINT "RecordRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccessGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatterMessage" ADD CONSTRAINT "ChatterMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatterMessage" ADD CONSTRAINT "ChatterMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconcileMatch" ADD CONSTRAINT "ReconcileMatch_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "BankStatementLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconcileMatch" ADD CONSTRAINT "ReconcileMatch_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationLayer" ADD CONSTRAINT "ValuationLayer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationLayer" ADD CONSTRAINT "ValuationLayer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationLayer" ADD CONSTRAINT "ValuationLayer_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRoute" ADD CONSTRAINT "StockRoute_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

