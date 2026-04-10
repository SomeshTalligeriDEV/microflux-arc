-- CreateTable
CREATE TABLE "User" (
    "walletAddress" TEXT NOT NULL,
    "nfd" TEXT,
    "telegramId" TEXT,
    "linkCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("walletAddress")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerKeyword" TEXT,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userWallet" TEXT NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_linkCode_key" ON "User"("linkCode");

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_userWallet_fkey" FOREIGN KEY ("userWallet") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;
