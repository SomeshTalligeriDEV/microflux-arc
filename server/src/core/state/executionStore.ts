export interface PendingExecution {
  token: string;
  chatId: string;
  workflowId: string;
  params: Record<string, unknown>;
}

const pendingExecutionMap = new Map<string, PendingExecution>();

export const setPendingExecution = (execution: PendingExecution): void => {
  pendingExecutionMap.set(execution.token, execution);
};

export const getPendingExecution = (token: string): PendingExecution | undefined => {
  return pendingExecutionMap.get(token);
};

export const clearPendingExecution = (token: string): void => {
  pendingExecutionMap.delete(token);
};
