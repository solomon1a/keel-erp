ALTER TABLE "Company" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'CN';

UPDATE "Company" SET "countryCode" = 'GB' WHERE "currency" = 'GBP';
UPDATE "Company" SET "countryCode" = 'US' WHERE "currency" = 'USD';
UPDATE "Company" SET "countryCode" = 'PK' WHERE "currency" = 'PKR';
UPDATE "Company" SET "countryCode" = 'OTHER' WHERE "currency" = 'EUR';
