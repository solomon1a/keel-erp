-- Phase 1 foundations. Existing posted amounts are not rewritten.

ALTER TABLE "PriceList" ADD COLUMN "side" TEXT NOT NULL DEFAULT 'sales';

ALTER TABLE "Invoice" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "paymentTermId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "recurringId" INTEGER;
UPDATE "Invoice" SET "dueDate" = "invoiceDate" WHERE "dueDate" IS NULL;

ALTER TABLE "Contact" ADD COLUMN "salePriceListId" INTEGER;
ALTER TABLE "Contact" ADD COLUMN "purchasePriceListId" INTEGER;
ALTER TABLE "Contact" ADD COLUMN "paymentTermId" INTEGER;
ALTER TABLE "Contact" ADD COLUMN "fiscalPositionId" INTEGER;

CREATE TABLE "PaymentTerm" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "PaymentTerm_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentTerm_companyId_name_key" ON "PaymentTerm"("companyId", "name");

CREATE TABLE "PaymentTermLine" (
  "id" SERIAL PRIMARY KEY,
  "termId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL,
  "days" INTEGER NOT NULL,
  CONSTRAINT "PaymentTermLine_termId_fkey" FOREIGN KEY ("termId") REFERENCES "PaymentTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentTermLine_termId_sequence_key" ON "PaymentTermLine"("termId", "sequence");

CREATE TABLE "InvoiceInstalment" (
  "id" SERIAL PRIMARY KEY,
  "invoiceId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "InvoiceInstalment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InvoiceInstalment_invoiceId_sequence_key" ON "InvoiceInstalment"("invoiceId", "sequence");

CREATE TABLE "FollowUpLevel" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "daysOverdue" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  CONSTRAINT "FollowUpLevel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FollowUpLevel_companyId_name_key" ON "FollowUpLevel"("companyId", "name");

CREATE TABLE "FollowUpLog" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "levelId" INTEGER NOT NULL,
  "channel" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowUpLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FollowUpLog_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "FollowUpLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FollowUpLog_invoiceId_levelId_key" ON "FollowUpLog"("invoiceId", "levelId");

CREATE TABLE "RecurringInvoice" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "partnerId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "intervalDays" INTEGER NOT NULL,
  "nextDate" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "RecurringInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RecurringInvoice_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecurringInvoice_companyId_name_key" ON "RecurringInvoice"("companyId", "name");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CompanyTax" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "priceInclude" BOOLEAN NOT NULL DEFAULT false,
  "compound" BOOLEAN NOT NULL DEFAULT false,
  "withholding" BOOLEAN NOT NULL DEFAULT false,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "CompanyTax_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CompanyTax_companyId_code_key" ON "CompanyTax"("companyId", "code");

CREATE TABLE "TaxGroup" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "TaxGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TaxGroup_companyId_name_key" ON "TaxGroup"("companyId", "name");

CREATE TABLE "TaxGroupTax" (
  "id" SERIAL PRIMARY KEY,
  "groupId" INTEGER NOT NULL,
  "taxId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  CONSTRAINT "TaxGroupTax_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TaxGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TaxGroupTax_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "CompanyTax"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TaxGroupTax_groupId_taxId_key" ON "TaxGroupTax"("groupId", "taxId");

CREATE TABLE "FiscalPosition" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT '',
  "partnerKind" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "FiscalPosition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FiscalPosition_companyId_name_key" ON "FiscalPosition"("companyId", "name");

CREATE TABLE "FiscalPositionMap" (
  "id" SERIAL PRIMARY KEY,
  "positionId" INTEGER NOT NULL,
  "taxId" INTEGER NOT NULL,
  "replacementId" INTEGER,
  CONSTRAINT "FiscalPositionMap_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "FiscalPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FiscalPositionMap_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "CompanyTax"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FiscalPositionMap_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "CompanyTax"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FiscalPositionMap_positionId_taxId_key" ON "FiscalPositionMap"("positionId", "taxId");

CREATE TABLE "DocumentTax" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "taxId" INTEGER NOT NULL,
  "model" TEXT NOT NULL,
  "recordId" INTEGER NOT NULL,
  "base" DOUBLE PRECISION NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "withheld" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "DocumentTax_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentTax_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "CompanyTax"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DocumentTax_companyId_taxId_idx" ON "DocumentTax"("companyId", "taxId");
CREATE INDEX "DocumentTax_companyId_model_recordId_idx" ON "DocumentTax"("companyId", "model", "recordId");

CREATE TABLE "MailLog" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "model" TEXT NOT NULL,
  "recordId" INTEGER NOT NULL,
  "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MailLog_companyId_model_recordId_idx" ON "MailLog"("companyId", "model", "recordId");

CREATE TABLE "FileBlob" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "model" TEXT NOT NULL,
  "recordId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "bytes" BYTEA,
  "url" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FileBlob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FileBlob_companyId_model_recordId_idx" ON "FileBlob"("companyId", "model", "recordId");

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_salePriceListId_fkey" FOREIGN KEY ("salePriceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_purchasePriceListId_fkey" FOREIGN KEY ("purchasePriceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_fiscalPositionId_fkey" FOREIGN KEY ("fiscalPositionId") REFERENCES "FiscalPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
