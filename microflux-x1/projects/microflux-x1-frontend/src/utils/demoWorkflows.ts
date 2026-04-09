import { WorkflowDefinition } from '../types/workflow';

/**
 * Demo Workflow 1: Simple ASA Transfer
 * A basic workflow that sends ALGO to fund a wallet, then transfers an ASA
 */
export const getASATransferDemo = (): WorkflowDefinition => ({
  version: '1.0',
  name: 'ASA Transfer Demo',
  description: 'Send ALGO to fund wallet, then transfer USDCa',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: 'node-1',
      type: 'transaction',
      position: { x: 250, y: 100 },
      data: {
        type: 'transaction',
        label: 'Fund Wallet',
        amount: 300000, // 0.3 ALGO for min balance + fees
        receiver: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
        note: 'Fund wallet for ASA opt-in',
      },
    },
    {
      id: 'node-2',
      type: 'assetTransfer',
      position: { x: 250, y: 250 },
      data: {
        type: 'assetTransfer',
        label: 'Transfer USDCa',
        assetId: 10458941, // USDCa on Testnet
        amount: 1000000, // 1 USDC (6 decimals)
        receiver: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
      },
    },
    {
      id: 'node-3',
      type: 'note',
      position: { x: 450, y: 175 },
      data: {
        type: 'note',
        label: 'Checkpoint',
        content: 'Verify receiver has opted in to USDCa (Asset ID: 10458941) before executing',
        isCheckpoint: true,
      },
    },
  ],
  edges: [
    {
      id: 'e-node-1-node-2',
      source: 'node-1',
      target: 'node-2',
      animated: true,
      style: { stroke: '#00d4aa' },
    },
  ],
});

/**
 * Demo Workflow 2: Multi-Step Treasury Workflow
 * A treasury management workflow with multiple operations
 */
export const getTreasuryDemo = (): WorkflowDefinition => ({
  version: '1.0',
  name: 'Multi-Step Treasury',
  description: 'Treasury management: send ALGO, send ASA, log transaction',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: 'treasury-1',
      type: 'transaction',
      position: { x: 250, y: 50 },
      data: {
        type: 'transaction',
        label: 'Treasury Allocation',
        amount: 10000000, // 10 ALGO
        receiver: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
        note: 'Monthly treasury allocation - ALGO',
      },
    },
    {
      id: 'treasury-2',
      type: 'assetTransfer',
      position: { x: 250, y: 200 },
      data: {
        type: 'assetTransfer',
        label: 'USDC Distribution',
        assetId: 10458941, // USDCa on Testnet
        amount: 50000000, // 50 USDC
        receiver: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
      },
    },
    {
      id: 'treasury-3',
      type: 'note',
      position: { x: 450, y: 125 },
      data: {
        type: 'note',
        label: 'Verification Step',
        content: 'Verify both transactions completed successfully before marking as done',
        isCheckpoint: true,
      },
    },
    {
      id: 'treasury-4',
      type: 'appCall',
      position: { x: 250, y: 350 },
      data: {
        type: 'appCall',
        label: 'Log to Registry',
        appId: 12345678, // Example logging app
        onComplete: 'NoOp',
        args: ['treasury_payout', '2024-01-15', '50000000'],
        accounts: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'],
        assets: [10458941],
      },
    },
  ],
  edges: [
    {
      id: 'e-treasury-1-treasury-2',
      source: 'treasury-1',
      target: 'treasury-2',
      animated: true,
      style: { stroke: '#00d4aa' },
    },
    {
      id: 'e-treasury-2-treasury-4',
      source: 'treasury-2',
      target: 'treasury-4',
      animated: true,
      style: { stroke: '#f59e0b' },
    },
  ],
});

/**
 * Load demo workflow into store
 */
export function loadDemoWorkflow(demoType: 'asa' | 'treasury'): WorkflowDefinition {
  switch (demoType) {
    case 'asa':
      return getASATransferDemo();
    case 'treasury':
      return getTreasuryDemo();
    default:
      return getASATransferDemo();
  }
}
