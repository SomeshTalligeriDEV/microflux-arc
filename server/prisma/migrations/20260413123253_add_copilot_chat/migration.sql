-- CreateTable
CREATE TABLE "CopilotChat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "userWallet" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "steps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotChat_userWallet_updatedAt_idx" ON "CopilotChat"("userWallet", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "CopilotMessage_chatId_createdAt_idx" ON "CopilotMessage"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "CopilotChat" ADD CONSTRAINT "CopilotChat_userWallet_fkey" FOREIGN KEY ("userWallet") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotMessage" ADD CONSTRAINT "CopilotMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "CopilotChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
