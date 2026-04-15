// src/services/api.ts
// Set VITE_API_URL (or VITE_API_BASE_URL) in .env.local — e.g. http://localhost:8080 or https://<api>.onrender.com. Defaults to local API if unset.
const API_ROOT = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8080'
).replace(/\/+$/, '');
const BASE_URL = `${API_ROOT}/api`;

export interface Workflow {
  id: string;
  name: string;
  triggerKeyword: string | null;
  nodes: any[];
  edges: any[];
  isActive: boolean;
  userWallet?: string;
}

export interface LinkStatus {
  linked: boolean;
  walletAddress: string;
  telegramId?: string | null;
  nfd?: string | null;
}

export interface TelegramLinkResponse {
  success: boolean;
  walletAddress: string;
  linkCode: string;
  command: string;
  botUsername: string | null;
  deepLink: string | null;
}

export interface PendingExecutionDetails {
  token: string;
  workflowId: string;
  workflowName: string;
  params: Record<string, unknown>;
  nodes: any[];
  edges: any[];
}

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Generate a one-time Telegram link command
  generateTelegramLink: async (walletAddress: string): Promise<TelegramLinkResponse> => {
    const res = await fetch(`${BASE_URL}/user/generate-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    });

    return readJsonOrThrow<TelegramLinkResponse>(res);
  },

  // Check if Telegram is linked
  getLinkStatus: async (walletAddress: string): Promise<LinkStatus> => {
    const res = await fetch(`${BASE_URL}/user/${walletAddress}`);
    return readJsonOrThrow<LinkStatus>(res);
  },

  // Fetch all saved workflows for the dashboard
  getWorkflows: async (walletAddress: string): Promise<Workflow[]> => {
    const res = await fetch(`${BASE_URL}/workflows/${encodeURIComponent(walletAddress)}`);
    const data = await readJsonOrThrow<{ success: boolean; workflows: Workflow[] }>(res);
    return data.workflows;
  },

  // Save the current canvas to the database
  saveWorkflow: async (walletAddress: string, workflowData: Partial<Workflow>): Promise<Workflow> => {
    const res = await fetch(`${BASE_URL}/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, ...workflowData }),
    });
    const data = await readJsonOrThrow<{ success: boolean; workflow: Workflow }>(res);
    return data.workflow;
  },

  updateWorkflow: async (workflowId: string, walletAddress: string, workflowData: Partial<Workflow>): Promise<Workflow> => {
    const res = await fetch(`${BASE_URL}/workflows/${workflowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, ...workflowData }),
    });
    const data = await readJsonOrThrow<{ success: boolean; workflow: Workflow }>(res);
    return data.workflow;
  },

  deleteWorkflow: async (workflowId: string, walletAddress: string): Promise<void> => {
    const res = await fetch(
      `${BASE_URL}/workflows/${workflowId}?walletAddress=${encodeURIComponent(walletAddress)}`,
      { method: 'DELETE' },
    );
    await readJsonOrThrow<{ success: boolean }>(res);
  },

  // NEW: Send a prompt to the AI Brain from the UI (instead of just Telegram)
  processAIIntent: async (walletAddress: string, prompt: string) => {
    const res = await fetch(`${BASE_URL}/ai/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, prompt }),
    });
    return readJsonOrThrow<any>(res);
  },

  getPendingExecution: async (token: string): Promise<PendingExecutionDetails> => {
    const res = await fetch(`${BASE_URL}/execution/${encodeURIComponent(token)}`);
    const data = await readJsonOrThrow<{ success: boolean; execution: PendingExecutionDetails }>(res);
    return data.execution;
  },

  confirmExecution: async (token: string, txId: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/execution/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, txId }),
    });
    await readJsonOrThrow<{ success: boolean }>(res);
  },
};
