// stores/workflowStore.ts — Core workflow state management
import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type Connection,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import type { WorkflowNodeData } from '../types/nodes';
import type { Workflow, DeploymentResult } from '../types/workflow';
import { validateNode, validateFlow } from '../lib/validator';
import { generateId } from '../lib/storage';

interface WorkflowState {
  // Flow data
  workflowId: string;
  workflowName: string;
  nodes: Node[];
  edges: Edge[];

  // Deployment
  lastDeploymentResult: DeploymentResult | null;
  lastCompiledTxnGroup: string[] | null;

  // Actions
  setWorkflowName: (name: string) => void;
  addNode: (node: Node) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  removeNode: (nodeId: string) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Workflow management
  loadWorkflow: (workflow: Workflow) => void;
  exportWorkflow: () => Workflow;
  clearWorkflow: () => void;

  // Deployment
  setLastDeploymentResult: (result: DeploymentResult | null) => void;
  setLastCompiledTxnGroup: (txnGroup: string[] | null) => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflowId: generateId(),
  workflowName: 'Untitled Workflow',
  nodes: [],
  edges: [],
  lastDeploymentResult: null,
  lastCompiledTxnGroup: null,

  setWorkflowName: (name) => set({ workflowName: name }),

  addNode: (node) =>
    set((state) => ({
      nodes: [...state.nodes, node],
    })),

  updateNodeData: (nodeId, data) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const updatedData = { ...node.data, ...data } as WorkflowNodeData;
        const errors = validateNode(updatedData);
        return {
          ...node,
          data: {
            ...updatedData,
            isValid: errors.length === 0,
            validationErrors: errors,
          },
        };
      }),
    })),

  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      ),
    })),

  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    })),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    })),

  onConnect: (connection) =>
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2 },
        },
        state.edges
      ),
    })),

  loadWorkflow: (workflow) =>
    set({
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodes: workflow.nodes,
      edges: workflow.edges,
      lastDeploymentResult: workflow.metadata?.lastDeploymentResult || null,
      lastCompiledTxnGroup: null,
    }),

  exportWorkflow: () => {
    const state = get();
    const validation = validateFlow(state.nodes, state.edges);
    return {
      id: state.workflowId,
      name: state.workflowName,
      description: '',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: state.nodes,
      edges: state.edges,
      metadata: {
        network: 'testnet' as const,
        estimatedFees: 0,
        nodeCount: state.nodes.length,
        isSimulated: false,
        lastDeploymentResult: state.lastDeploymentResult || undefined,
      },
    };
  },

  clearWorkflow: () =>
    set({
      workflowId: generateId(),
      workflowName: 'Untitled Workflow',
      nodes: [],
      edges: [],
      lastDeploymentResult: null,
      lastCompiledTxnGroup: null,
    }),

  setLastDeploymentResult: (result) => set({ lastDeploymentResult: result }),
  setLastCompiledTxnGroup: (txnGroup) => set({ lastCompiledTxnGroup: txnGroup }),
}));
