// src/services/api.ts
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

export interface Workflow {
  id: string;
  name: string;
  triggerKeyword: string | null;
  nodes: any[];
  edges: any[];
  isActive: boolean;
}

export interface LinkStatus {
  linked: boolean;
  walletAddress: string;
  telegramId?: string | null;
  nfd?: string | null;
}

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Check if Telegram is linked
  getLinkStatus: async (walletAddress: string): Promise<LinkStatus> => {
    const res = await fetch(`${BASE_URL}/user/${walletAddress}`);
    return readJsonOrThrow<LinkStatus>(res);
  },

  // Fetch all saved workflows for the dashboard
  getWorkflows: async (walletAddress: string): Promise<Workflow[]> => {
    const res = await fetch(`${BASE_URL}/workflows?walletAddress=${encodeURIComponent(walletAddress)}`);
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

  // NEW: Send a prompt to the AI Brain from the UI (instead of just Telegram)
  processAIIntent: async (walletAddress: string, prompt: string) => {
    const res = await fetch(`${BASE_URL}/ai/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, prompt }),
    });
    return readJsonOrThrow<any>(res);
  }
};