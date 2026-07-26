CREATE TABLE "InviteToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "crewMemberId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "role" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InviteToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InviteToken_tokenHash_key" ON "InviteToken"("tokenHash");
CREATE INDEX "InviteToken_companyId_idx" ON "InviteToken"("companyId");
