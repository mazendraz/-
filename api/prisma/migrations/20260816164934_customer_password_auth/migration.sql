-- AlterTable
ALTER TABLE "CustomerUser" ADD COLUMN     "emailVerifyExpires" TIMESTAMP(3),
ADD COLUMN     "emailVerifyTokenHash" TEXT,
ADD COLUMN     "passwordHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUser_emailVerifyTokenHash_key" ON "CustomerUser"("emailVerifyTokenHash");

