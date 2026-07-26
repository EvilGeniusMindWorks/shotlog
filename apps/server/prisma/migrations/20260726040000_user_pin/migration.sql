-- Offline unlock PIN follows the account: same PIN on every device
ALTER TABLE "User" ADD COLUMN "pinHash" TEXT;
