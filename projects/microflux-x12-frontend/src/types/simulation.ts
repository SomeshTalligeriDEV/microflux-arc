// types/simulation.ts — Simulation result types

export interface SimulationResult {
  success: boolean;
  steps: SimulationStep[];
  totalFees: number;
  errors: string[];
}

export interface SimulationStep {
  index: number;
  nodeId: string;
  type: 'Payment' | 'ASA Transfer' | 'App Call' | 'Note';
  sender: string;
  receiver: string;
  amount: string; // Human-readable: "1.5 ALGO" or "100 ASA#12345"
  assetId?: number;
  fee: number; // microAlgos
  status: 'pending' | 'success' | 'failed';
  note?: string;
  errorMessage?: string;
}
