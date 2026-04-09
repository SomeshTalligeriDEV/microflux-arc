export type TransactionType = 'payment' | 'assetTransfer' | 'appCall' | 'note';

export interface SimulationStep {
  step: number;
  type: TransactionType;
  description: string;
  sender: string;
  receiver?: string;
  amount?: number;
  assetId?: number;
  appId?: number;
  fee: number;
  status: 'pending' | 'success' | 'error';
  error?: string;
  logs?: string[];
}

export interface SimulationResult {
  steps: SimulationStep[];
  totalFees: number;
  success: boolean;
  error?: string;
  rawDryrunResponse?: any;
}

export type SimulationStatus = 'idle' | 'running' | 'success' | 'error';

export interface DryrunTxnResult {
  'confirmed-round'?: number;
  'pool-error'?: string;
  fee?: number;
  logs?: string[];
  'inner-txns'?: any[];
}
