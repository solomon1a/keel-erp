-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "currency" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN "rate" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "InvoicePayment" ADD COLUMN "rate" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "FxRevaluation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "entryId" INTEGER,
    "reversed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRevaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FxRevaluation_entryId_key" ON "FxRevaluation"("entryId");
CREATE INDEX "FxRevaluation_companyId_idx" ON "FxRevaluation"("companyId");

-- AddForeignKey
ALTER TABLE "FxRevaluation" ADD CONSTRAINT "FxRevaluation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FxRevaluation" ADD CONSTRAINT "FxRevaluation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
