-- Quality checks, project billing, and richer bank statements.
-- Quarantine is its own location type so it stays out of internal on-hand counts.

ALTER TABLE "Employee" ADD COLUMN "hourlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Employee" ADD COLUMN "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "BankStatement" ADD COLUMN "bankAccountId" INTEGER;
ALTER TABLE "BankStatement" ADD COLUMN "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "BankStatementLine" ADD COLUMN "reference" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BankStatementLine" ADD COLUMN "fingerprint" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ReconcileMatch" ALTER COLUMN "invoiceId" DROP NOT NULL;
ALTER TABLE "ReconcileMatch" ADD COLUMN "entryId" INTEGER;
ALTER TABLE "ReconcileMatch" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'payment';

ALTER TABLE "ExpenseClaim" ADD COLUMN "projectId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "projectId" INTEGER;

CREATE TABLE "QualityPoint" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "trigger" TEXT NOT NULL,
  "operationName" TEXT NOT NULL DEFAULT '',
  "checkType" TEXT NOT NULL,
  "minValue" DOUBLE PRECISION,
  "maxValue" DOUBLE PRECISION,
  "checklist" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QualityCheck" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "pointId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "trigger" TEXT NOT NULL,
  "operationName" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "measured" DOUBLE PRECISION,
  "checklistDone" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "purchaseOrderId" INTEGER,
  "salesOrderId" INTEGER,
  "manufacturingOrderId" INTEGER,
  "vendorId" INTEGER,
  "overrideReason" TEXT,
  "overrideById" INTEGER,
  "overrideAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QualityAlert" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "checkId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "vendorId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'open',
  "action" TEXT,
  "heldFrom" TEXT NOT NULL DEFAULT 'none',
  "quantity" DOUBLE PRECISION NOT NULL,
  "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note" TEXT NOT NULL DEFAULT '',
  "entryId" INTEGER,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "partnerId" INTEGER,
  "billingType" TEXT NOT NULL,
  "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectStage" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "projectId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  CONSTRAINT "ProjectStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectTask" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "projectId" INTEGER NOT NULL,
  "stageId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "assigneeId" INTEGER,
  "deadline" TIMESTAMP(3),
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "sequence" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskDependency" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "taskId" INTEGER NOT NULL,
  "dependsOnId" INTEGER NOT NULL,
  CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Timesheet" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "projectId" INTEGER NOT NULL,
  "taskId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "workDate" TIMESTAMP(3) NOT NULL,
  "hours" DOUBLE PRECISION NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'draft',
  "invoiceId" INTEGER,
  "description" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectMilestone" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "projectId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "dueDate" TIMESTAMP(3),
  "state" TEXT NOT NULL DEFAULT 'open',
  "invoiceId" INTEGER,
  CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankAccount" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "accountCode" TEXT NOT NULL DEFAULT '1002',
  "currency" TEXT NOT NULL,
  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconcileRule" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "matchKind" TEXT NOT NULL DEFAULT 'contains',
  "matchText" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "accountCode" TEXT NOT NULL,
  CONSTRAINT "ReconcileRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QualityAlert_checkId_key" ON "QualityAlert"("checkId");
CREATE INDEX "QualityPoint_companyId_productId_trigger_idx" ON "QualityPoint"("companyId", "productId", "trigger");
CREATE INDEX "QualityCheck_companyId_status_idx" ON "QualityCheck"("companyId", "status");
CREATE INDEX "QualityCheck_purchaseOrderId_idx" ON "QualityCheck"("purchaseOrderId");
CREATE INDEX "QualityCheck_salesOrderId_idx" ON "QualityCheck"("salesOrderId");
CREATE INDEX "QualityCheck_manufacturingOrderId_idx" ON "QualityCheck"("manufacturingOrderId");
CREATE INDEX "QualityAlert_companyId_status_idx" ON "QualityAlert"("companyId", "status");
CREATE UNIQUE INDEX "Project_companyId_name_key" ON "Project"("companyId", "name");
CREATE INDEX "ProjectStage_projectId_idx" ON "ProjectStage"("projectId");
CREATE INDEX "ProjectTask_projectId_stageId_idx" ON "ProjectTask"("projectId", "stageId");
CREATE UNIQUE INDEX "TaskDependency_taskId_dependsOnId_key" ON "TaskDependency"("taskId", "dependsOnId");
CREATE INDEX "Timesheet_companyId_state_idx" ON "Timesheet"("companyId", "state");
CREATE INDEX "Timesheet_projectId_idx" ON "Timesheet"("projectId");
CREATE INDEX "ProjectMilestone_projectId_state_idx" ON "ProjectMilestone"("projectId", "state");
CREATE UNIQUE INDEX "BankAccount_companyId_name_key" ON "BankAccount"("companyId", "name");
CREATE UNIQUE INDEX "ReconcileRule_companyId_name_key" ON "ReconcileRule"("companyId", "name");
CREATE INDEX "BankStatementLine_companyId_fingerprint_idx" ON "BankStatementLine"("companyId", "fingerprint");

ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReconcileMatch" ADD CONSTRAINT "ReconcileMatch_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QualityPoint" ADD CONSTRAINT "QualityPoint_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityPoint" ADD CONSTRAINT "QualityPoint_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "QualityPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_overrideById_fkey" FOREIGN KEY ("overrideById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityAlert" ADD CONSTRAINT "QualityAlert_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityAlert" ADD CONSTRAINT "QualityAlert_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "QualityCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityAlert" ADD CONSTRAINT "QualityAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityAlert" ADD CONSTRAINT "QualityAlert_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityAlert" ADD CONSTRAINT "QualityAlert_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectStage" ADD CONSTRAINT "ProjectStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconcileRule" ADD CONSTRAINT "ReconcileRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
