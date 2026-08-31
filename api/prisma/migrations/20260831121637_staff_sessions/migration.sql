-- CreateTable
CREATE TABLE "StaffSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "previousTokenHash" TEXT,
    "previousUsableTo" TIMESTAMP(3),
    "deviceName" TEXT,
    "platform" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_previousTokenHash_key" ON "StaffSession"("previousTokenHash");

-- CreateIndex
CREATE INDEX "StaffSession_userId_idx" ON "StaffSession"("userId");

-- CreateIndex
CREATE INDEX "StaffSession_expiresAt_idx" ON "StaffSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
