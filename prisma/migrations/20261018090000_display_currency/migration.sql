ALTER TABLE "User" ADD COLUMN "displayCurrency" TEXT;

CREATE TABLE "ExchangeRate" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExchangeRate_companyId_currency_key" ON "ExchangeRate"("companyId", "currency");

CREATE INDEX "ExchangeRate_companyId_idx" ON "ExchangeRate"("companyId");

ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
