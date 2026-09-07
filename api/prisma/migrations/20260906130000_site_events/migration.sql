-- CreateTable
CREATE TABLE "SiteEvent" (
    "id" TEXT NOT NULL,
    "sessionId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(48) NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "source" VARCHAR(120),
    "target" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteEvent_name_createdAt_idx" ON "SiteEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "SiteEvent_createdAt_idx" ON "SiteEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SiteEvent_sessionId_createdAt_idx" ON "SiteEvent"("sessionId", "createdAt");
