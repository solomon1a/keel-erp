-- Helpdesk tickets, tags, teams, and SLA policies.

CREATE TABLE "HelpdeskTeam" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "HelpdeskTeam_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HelpdeskTeam_companyId_name_key" ON "HelpdeskTeam"("companyId", "name");

CREATE TABLE "HelpdeskTag" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "HelpdeskTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HelpdeskTag_companyId_name_key" ON "HelpdeskTag"("companyId", "name");

CREATE TABLE "SlaPolicy" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "priority" TEXT NOT NULL,
  "hours" INTEGER NOT NULL,
  CONSTRAINT "SlaPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SlaPolicy_companyId_priority_key" ON "SlaPolicy"("companyId", "priority");

CREATE TABLE "Ticket" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "partnerId" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "teamId" INTEGER,
  "assigneeId" INTEGER,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "stage" TEXT NOT NULL DEFAULT 'new',
  "slaDeadline" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Ticket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Ticket_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Ticket_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "HelpdeskTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Ticket_companyId_number_key" ON "Ticket"("companyId", "number");
CREATE INDEX "Ticket_companyId_stage_idx" ON "Ticket"("companyId", "stage");

CREATE TABLE "TicketTag" (
  "ticketId" INTEGER NOT NULL,
  "tagId" INTEGER NOT NULL,
  CONSTRAINT "TicketTag_pkey" PRIMARY KEY ("ticketId", "tagId"),
  CONSTRAINT "TicketTag_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TicketTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "HelpdeskTag"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TicketMessage" (
  "id" SERIAL PRIMARY KEY,
  "ticketId" INTEGER NOT NULL,
  "authorName" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "internal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");
