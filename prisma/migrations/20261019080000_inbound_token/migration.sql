-- Per-company secret for helpdesk inbound mail.

ALTER TABLE "Company" ADD COLUMN "inboundToken" TEXT;
CREATE UNIQUE INDEX "Company_inboundToken_key" ON "Company"("inboundToken");
