// types/workflow.ts — Workflow and deployment types
import type { Node, Edge } from '@xyflow/react';
import type { SimulationResult } from './simulation';

export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  nodes: Node[];
  edges: Edge[];
  metadata: WorkflowMetadata;
}

export interface WorkflowMetadata {
  network: 'testnet' | 'mainnet' | 'localnet';
  estimatedFees: number;
  nodeCount: number;
  isSimulated: boolean;
  lastSimulationResult?: SimulationResult;
  lastDeploymentResult?: DeploymentResult;
}

export interface DeploymentResult {
  appId?: number;
  txnGroupId: string;
  txnIds: string[];
  timestamp: string;
  confirmedRound: number;
}

export interface CompiledWorkflow {
  transactions: Uint8Array[];
  encodedTxns: string[]; // base64 encoded for replay
  groupId: string | null;
  nodeCount: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  nodeId?: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}
