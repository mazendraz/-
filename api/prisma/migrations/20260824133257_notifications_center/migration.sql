-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LEAD_CREATED', 'LEAD_STATUS', 'LEAD_COMPLETED', 'CHAT_MESSAGE', 'WAITLIST_NOTIFIED', 'MARKETING');

-- AlterTable
ALTER TABLE "CustomerUser" ADD COLUMN     "marketingEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "marketingPushEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_customerId_read_createdAt_idx" ON "Notification"("customerId", "read", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
