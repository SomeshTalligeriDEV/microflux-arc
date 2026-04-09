// data/demoFlows.ts — Pre-built demo workflows
import type { Workflow } from '../types/workflow';

export const DEMO_SEND_ASA: Workflow = {
  id: 'demo-send-asa',
  name: 'Send ASA',
  description: 'Simple ASA transfer with ALGO balance cover',
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: 'pay-1',
      type: 'transactionNode',
      position: { x: 120, y: 220 },
      data: {
        id: 'pay-1',
        label: 'Cover Min Balance',
        category: 'transaction',
        sender: '',
        receiver: '',
        amount: 100000,
        note: 'Min balance cover via Microflux',
        isValid: false,
        validationErrors: ['Receiver address is required'],
      },
    },
    {
      id: 'asa-1',
      type: 'assetTransferNode',
      position: { x: 460, y: 220 },
      data: {
        id: 'asa-1',
        label: 'Send ASA',
        category: 'asset_transfer',
        sender: '',
        receiver: '',
        assetId: 0,
        amount: 0,
        note: 'ASA transfer via Microflux',
        isValid: false,
        validationErrors: ['Receiver address is required', 'Asset ID is required', 'Amount must be greater than 0'],
      },
    },
    {
      id: 'note-1',
      type: 'noteNode',
      position: { x: 800, y: 220 },
      data: {
        id: 'note-1',
        label: 'Transfer Note',
        category: 'note',
        content: 'ASA Transfer executed atomically via Microflux-X1',
        color: '#f59e0b',
        isValid: true,
        validationErrors: [],
      },
    },
  ],
  edges: [
    { id: 'e1-2', source: 'pay-1', target: 'asa-1', type: 'smoothstep', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
    { id: 'e2-3', source: 'asa-1', target: 'note-1', type: 'smoothstep', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
  ],
  metadata: {
    network: 'testnet',
    estimatedFees: 2000,
    nodeCount: 3,
    isSimulated: false,
  },
};

export const DEMO_TREASURY: Workflow = {
  id: 'demo-treasury',
  name: 'Multi-Step Treasury',
  description: 'Send ALGO + ASA to treasury wallet with on-chain logging',
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: 'treasury-pay',
      type: 'transactionNode',
      position: { x: 120, y: 220 },
      data: {
        id: 'treasury-pay',
        label: 'Send ALGO to Treasury',
        category: 'transaction',
        sender: '',
        receiver: '',
        amount: 1000000,
        note: 'Treasury ALGO deposit',
        isValid: false,
        validationErrors: ['Receiver address is required'],
      },
    },
    {
      id: 'treasury-asa',
      type: 'assetTransferNode',
      position: { x: 460, y: 220 },
      data: {
        id: 'treasury-asa',
        label: 'Send ASA to Treasury',
        category: 'asset_transfer',
        sender: '',
        receiver: '',
        assetId: 0,
        amount: 50,
        note: 'Treasury ASA deposit',
        isValid: false,
        validationErrors: ['Receiver address is required', 'Asset ID is required'],
      },
    },
    {
      id: 'treasury-log',
      type: 'appCallNode',
      position: { x: 800, y: 220 },
      data: {
        id: 'treasury-log',
        label: 'Log Execution',
        category: 'app_call',
        sender: '',
        appId: 0,
        method: 'execute',
        args: [],
        note: 'Treasury workflow execution log',
        isValid: false,
        validationErrors: ['App ID is required'],
      },
    },
  ],
  edges: [
    { id: 'et1-2', source: 'treasury-pay', target: 'treasury-asa', type: 'smoothstep', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
    { id: 'et2-3', source: 'treasury-asa', target: 'treasury-log', type: 'smoothstep', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
  ],
  metadata: {
    network: 'testnet',
    estimatedFees: 3000,
    nodeCount: 3,
    isSimulated: false,
  },
};

export const DEMO_FLOWS = [DEMO_SEND_ASA, DEMO_TREASURY];
