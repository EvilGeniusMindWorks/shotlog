-- Round S2: the role-aware walkthrough auto-runs once per ACCOUNT
ALTER TABLE "User" ADD COLUMN "tourDoneAt" TIMESTAMP(3);
