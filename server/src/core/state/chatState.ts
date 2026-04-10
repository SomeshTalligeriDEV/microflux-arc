export type ChatStateStatus = 'AWAITING_INPUT';
export type ChatExpectedType = 'WALLET_ADDRESS' | 'AMOUNT' | 'EXECUTION_CONFIRMATION';

export interface ChatState {
  status: ChatStateStatus;
  expectedType: ChatExpectedType;
  workflowId: string;
  collectedData: any;
}

const chatStateMap = new Map<string, ChatState>();

export const setChatState = (chatId: string, state: ChatState): void => {
  chatStateMap.set(chatId, state);
};

export const getChatState = (chatId: string): ChatState | undefined => {
  return chatStateMap.get(chatId);
};

export const clearChatState = (chatId: string): void => {
  chatStateMap.delete(chatId);
};
