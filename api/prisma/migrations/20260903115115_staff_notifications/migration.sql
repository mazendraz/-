-- CreateEnum
CREATE TYPE "StaffNotificationType" AS ENUM ('LEAD_NEW', 'LEAD_STATUS', 'LEAD_COMPLETED', 'CHAT_MESSAGE', 'CHANGE_REQUEST', 'PROJECT_SUBMITTED', 'REVIEW_SUBMITTED', 'SYSTEM');

-- CreateTable
CREATE TABLE "StaffNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "StaffNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffNotification_userId_read_createdAt_idx" ON "StaffNotification"("userId", "read", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffNotification" ADD CONSTRAINT "StaffNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
