-- AlterTable
ALTER TABLE "CustomerUser" ADD COLUMN     "passwordResetExpires" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUser_passwordResetTokenHash_key" ON "CustomerUser"("passwordResetTokenHash");
