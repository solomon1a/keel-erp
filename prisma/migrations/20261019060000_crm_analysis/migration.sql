-- Lead source, tags, lost reasons, and activity assignees.

ALTER TABLE "Lead" ADD COLUMN "source" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Lead" ADD COLUMN "lostReasonId" INTEGER;

ALTER TABLE "Activity" ADD COLUMN "assigneeId" INTEGER;

CREATE TABLE "CrmTag" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "CrmTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CrmTag_companyId_name_key" ON "CrmTag"("companyId", "name");

CREATE TABLE "LeadTag" (
  "leadId" INTEGER NOT NULL,
  "tagId" INTEGER NOT NULL,
  CONSTRAINT "LeadTag_pkey" PRIMARY KEY ("leadId", "tagId"),
  CONSTRAINT "LeadTag_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CrmTag"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LostReason" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "LostReason_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LostReason_companyId_name_key" ON "LostReason"("companyId", "name");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_lostReasonId_fkey" FOREIGN KEY ("lostReasonId") REFERENCES "LostReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
