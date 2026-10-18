ALTER TABLE "Company" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

ALTER TABLE "DemoRun" ADD COLUMN "qualityPointId" INTEGER;
ALTER TABLE "DemoRun" ADD COLUMN "statementId" INTEGER;
ALTER TABLE "DemoRun" ADD COLUMN "projectId" INTEGER;
ALTER TABLE "DemoRun" ADD COLUMN "projectInvoiceId" INTEGER;

CREATE TABLE "MailList" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "segment" TEXT NOT NULL DEFAULT 'both',
  "tag" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "MailList_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MailList_companyId_name_key" ON "MailList"("companyId", "name");
ALTER TABLE "MailList" ADD CONSTRAINT "MailList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MailMember" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "listId" INTEGER NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'subscribed',
  "contactId" INTEGER,
  "leadId" INTEGER,
  CONSTRAINT "MailMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MailMember_listId_email_key" ON "MailMember"("listId", "email");
CREATE INDEX "MailMember_companyId_email_idx" ON "MailMember"("companyId", "email");
ALTER TABLE "MailMember" ADD CONSTRAINT "MailMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MailList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailMember" ADD CONSTRAINT "MailMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MailMember" ADD CONSTRAINT "MailMember_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MailSuppression" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "email" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailSuppression_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MailSuppression_companyId_email_key" ON "MailSuppression"("companyId", "email");
ALTER TABLE "MailSuppression" ADD CONSTRAINT "MailSuppression_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MailTemplate" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "blocks" JSONB NOT NULL,
  CONSTRAINT "MailTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MailTemplate_companyId_name_key" ON "MailTemplate"("companyId", "name");
ALTER TABLE "MailTemplate" ADD CONSTRAINT "MailTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Campaign" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "listId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "subjectB" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT 'draft',
  "blocks" JSONB NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "channel" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Campaign_companyId_name_key" ON "Campaign"("companyId", "name");
CREATE INDEX "Campaign_companyId_state_idx" ON "Campaign"("companyId", "state");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MailList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CampaignRecipient" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "campaignId" INTEGER NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "subject" TEXT NOT NULL,
  "variant" TEXT NOT NULL DEFAULT 'a',
  "token" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "openedAt" TIMESTAMP(3),
  "clickedAt" TIMESTAMP(3),
  "openCount" INTEGER NOT NULL DEFAULT 0,
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CampaignRecipient_token_key" ON "CampaignRecipient"("token");
CREATE INDEX "CampaignRecipient_companyId_sentAt_idx" ON "CampaignRecipient"("companyId", "sentAt");
CREATE INDEX "CampaignRecipient_campaignId_idx" ON "CampaignRecipient"("campaignId");
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SiteTheme" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "siteName" TEXT NOT NULL DEFAULT '',
  "primary" TEXT NOT NULL DEFAULT '#0E6B5C',
  "ink" TEXT NOT NULL DEFAULT '#1C2B2A',
  "paper" TEXT NOT NULL DEFAULT '#F3F6F4',
  "font" TEXT NOT NULL DEFAULT 'serif',
  "logoUrl" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "SiteTheme_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SiteTheme_companyId_key" ON "SiteTheme"("companyId");
ALTER TABLE "SiteTheme" ADD CONSTRAINT "SiteTheme_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SiteMenuItem" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SiteMenuItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SiteMenuItem_companyId_sequence_idx" ON "SiteMenuItem"("companyId", "sequence");
ALTER TABLE "SiteMenuItem" ADD CONSTRAINT "SiteMenuItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SitePage" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "seoTitle" TEXT NOT NULL DEFAULT '',
  "seoDescription" TEXT NOT NULL DEFAULT '',
  "ogImage" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT 'draft',
  "blocks" JSONB NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SitePage_companyId_slug_key" ON "SitePage"("companyId", "slug");
CREATE INDEX "SitePage_companyId_state_idx" ON "SitePage"("companyId", "state");
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BlogPost" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL DEFAULT '',
  "coverUrl" TEXT NOT NULL DEFAULT '',
  "seoTitle" TEXT NOT NULL DEFAULT '',
  "seoDescription" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT 'draft',
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlogPost_companyId_slug_key" ON "BlogPost"("companyId", "slug");
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SiteSubmission" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "leadId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SiteSubmission_companyId_createdAt_idx" ON "SiteSubmission"("companyId", "createdAt");
ALTER TABLE "SiteSubmission" ADD CONSTRAINT "SiteSubmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SiteSubmission" ADD CONSTRAINT "SiteSubmission_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
