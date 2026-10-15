-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "onlineWarehouseId" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "websitePublished" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'desk',
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "paymentState" TEXT,
ADD COLUMN     "publicToken" TEXT;

-- CreateTable
CREATE TABLE "ShopCustomer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "contactId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSession" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopCustomer_companyId_email_key" ON "ShopCustomer"("companyId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSession_tokenHash_key" ON "ShopSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ShopSession_customerId_idx" ON "ShopSession"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_publicToken_key" ON "SalesOrder"("publicToken");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_onlineWarehouseId_fkey" FOREIGN KEY ("onlineWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopCustomer" ADD CONSTRAINT "ShopCustomer_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopCustomer" ADD CONSTRAINT "ShopCustomer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopSession" ADD CONSTRAINT "ShopSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "ShopCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

