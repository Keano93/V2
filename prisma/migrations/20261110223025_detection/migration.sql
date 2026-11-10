-- CreateTable
CREATE TABLE "DetectionCache" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DetectionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "detector" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "batches" INTEGER NOT NULL DEFAULT 0,
    "cacheHits" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "eventsFound" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "DetectionRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "runId" TEXT,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reasoning" TEXT,
    "awarenessDate" DATETIME NOT NULL,
    "quote" TEXT NOT NULL,
    "quoteMessageId" TEXT,
    "quoteVerified" BOOLEAN NOT NULL DEFAULT false,
    "confidence" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DetectionRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventMessage" (
    "eventId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,

    PRIMARY KEY ("eventId", "messageId"),
    CONSTRAINT "EventMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Event_projectId_status_idx" ON "Event"("projectId", "status");
