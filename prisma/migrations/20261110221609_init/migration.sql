-- CreateTable
CREATE TABLE "ContractType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NoticeRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractTypeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "dayBasis" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "clauseRef" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NoticeRule_contractTypeId_fkey" FOREIGN KEY ("contractTypeId") REFERENCES "ContractType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "client" TEXT,
    "ourRole" TEXT,
    "contractTypeId" TEXT NOT NULL,
    "shutdownStart" TEXT,
    "shutdownEnd" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_contractTypeId_fkey" FOREIGN KEY ("contractTypeId") REFERENCES "ContractType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT,
    "rawText" TEXT NOT NULL,
    "warnings" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Source_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "sender" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL,
    "timePrecision" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    CONSTRAINT "Message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractType_key_key" ON "ContractType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeRule_contractTypeId_eventType_key" ON "NoticeRule"("contractTypeId", "eventType");

-- CreateIndex
CREATE INDEX "Message_projectId_sentAt_idx" ON "Message"("projectId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_sourceId_ordinal_key" ON "Message"("sourceId", "ordinal");
