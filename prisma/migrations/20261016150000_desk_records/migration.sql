-- CreateTable
CREATE TABLE "DeskRecord" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "partner" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "bucket" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "recordDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeskRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleSetting" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ModuleSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeskRecord_companyId_module_screen_idx" ON "DeskRecord"("companyId", "module", "screen");

-- CreateIndex
CREATE UNIQUE INDEX "DeskRecord_companyId_module_screen_name_key" ON "DeskRecord"("companyId", "module", "screen", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleSetting_companyId_module_key_key" ON "ModuleSetting"("companyId", "module", "key");

-- AddForeignKey
ALTER TABLE "DeskRecord" ADD CONSTRAINT "DeskRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleSetting" ADD CONSTRAINT "ModuleSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
