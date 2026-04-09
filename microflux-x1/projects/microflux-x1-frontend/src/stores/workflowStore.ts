import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { XYPosition } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowNodeType, WorkflowNode, WorkflowEdge, WorkflowDefinition, ValidationResult, WorkflowExecution } from '../types/workflow';

interface WorkflowState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  workflowName: string;
  workflowDescription: string;
  lastExecution: WorkflowExecution | null;
  
  // Actions
  addNode: (type: WorkflowNodeType['type'], position: XYPosition) => void;
  updateNode: (id: string, data: Partial<WorkflowNodeType>) => void;
  removeNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  addEdge: (connection: { source: string; target: string }) => void;
  removeEdge: (id: string) => void;
  setWorkflowMeta: (name: string, description?: string) => void;
  validateWorkflow: () => ValidationResult;
  exportWorkflow: () => string;
  importWorkflow: (json: string) => void;
  clearWorkflow: () => void;
  saveExecution: (execution: WorkflowExecution) => void;
  getLastExecution: () => WorkflowExecution | null;
}

const getDefaultNodeData = (type: WorkflowNodeType['type']): WorkflowNodeType => {
  switch (type) {
    case 'transaction':
      return {
        type: 'transaction',
        label: 'Payment',
        amount: 1000000,
        receiver: '',
        note: '',
      };
    case 'assetTransfer':
      return {
        type: 'assetTransfer',
        label: 'ASA Transfer',
        assetId: 0,
        amount: 1,
        receiver: '',
      };
    case 'appCall':
      return {
        type: 'appCall',
        label: 'App Call',
        appId: 0,
        onComplete: 'NoOp',
        args: [],
      };
    case 'note':
      return {
        type: 'note',
        label: 'Note',
        content: '',
        isCheckpoint: false,
      };
    default:
      throw new Error(`Unknown node type: ${type}`);
  }
};

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      workflowName: 'Untitled Workflow',
      workflowDescription: '',
      lastExecution: null,

      addNode: (type, position) => {
        const newNode: WorkflowNode = {
          id: uuidv4(),
          type,
          position,
          data: getDefaultNodeData(type),
        };
        set((state) => ({
          nodes: [...state.nodes, newNode],
          selectedNodeId: newNode.id,
        }));
      },

      updateNode: (id, data) => {
        set((state: WorkflowState) => ({
          ...state,
          nodes: state.nodes.map((node) => {
            if (node.id !== id) return node;
            const updatedData = { ...node.data, ...data } as WorkflowNodeType;
            return { ...node, data: updatedData } as WorkflowNode;
          }),
        }));
      },

      removeNode: (id) => {
        set((state) => ({
          nodes: state.nodes.filter((n) => n.id !== id),
          edges: state.edges.filter((e) => e.source !== id && e.target !== id),
          selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        }));
      },

      selectNode: (id) => {
        set({ selectedNodeId: id });
      },

      addEdge: (connection) => {
        const newEdge: WorkflowEdge = {
          id: `e-${connection.source}-${connection.target}`,
          source: connection.source,
          target: connection.target,
          animated: true,
          style: { stroke: '#00d4aa' },
        };
        set((state) => ({
          edges: [...state.edges, newEdge],
        }));
      },

      removeEdge: (id) => {
        set((state) => ({
          edges: state.edges.filter((e) => e.id !== id),
        }));
      },

      setWorkflowMeta: (name, description) => {
        set({ workflowName: name, workflowDescription: description || '' });
      },

      validateWorkflow: () => {
        const { nodes, edges } = get();
        const errors: string[] = [];

        if (nodes.length === 0) {
          errors.push('Workflow has no nodes');
        }

        // Check for orphaned nodes (except single node workflows)
        if (nodes.length > 1) {
          const connectedNodeIds = new Set<string>();
          edges.forEach((e) => {
            connectedNodeIds.add(e.source);
            connectedNodeIds.add(e.target);
          });

          const orphanedNodes = nodes.filter((n) => !connectedNodeIds.has(n.id));
          if (orphanedNodes.length > 0) {
            errors.push(`${orphanedNodes.length} node(s) not connected to flow`);
          }
        }

        // Validate node data
        nodes.forEach((node) => {
          switch (node.data.type) {
            case 'transaction':
              if (!node.data.receiver) {
                errors.push(`Payment node "${node.data.label}" missing receiver`);
              }
              if (node.data.amount <= 0) {
                errors.push(`Payment node "${node.data.label}" amount must be > 0`);
              }
              break;
            case 'assetTransfer':
              if (!node.data.receiver) {
                errors.push(`ASA Transfer node "${node.data.label}" missing receiver`);
              }
              if (node.data.assetId <= 0) {
                errors.push(`ASA Transfer node "${node.data.label}" missing asset ID`);
              }
              break;
            case 'appCall':
              if (node.data.appId <= 0) {
                errors.push(`App Call node "${node.data.label}" missing app ID`);
              }
              break;
          }
        });

        // Check for cycles
        const hasCycle = (start: string, visited: Set<string> = new Set()): boolean => {
          if (visited.has(start)) return true;
          visited.add(start);
          const outgoing = edges.filter((e) => e.source === start);
          return outgoing.some((e) => hasCycle(e.target, new Set(visited)));
        };

        nodes.forEach((n) => {
          if (hasCycle(n.id)) {
            errors.push('Workflow contains cycles');
          }
        });

        return { valid: errors.length === 0, errors };
      },

      exportWorkflow: () => {
        const { nodes, edges, workflowName, workflowDescription } = get();
        const workflow: WorkflowDefinition = {
          version: '1.0',
          name: workflowName,
          description: workflowDescription,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          nodes,
          edges,
        };
        return JSON.stringify(workflow, null, 2);
      },

      importWorkflow: (json) => {
        try {
          const workflow: WorkflowDefinition = JSON.parse(json);
          set({
            nodes: workflow.nodes || [],
            edges: workflow.edges || [],
            workflowName: workflow.name || 'Imported Workflow',
            workflowDescription: workflow.description || '',
            selectedNodeId: null,
          });
        } catch (e) {
          throw new Error('Invalid workflow JSON');
        }
      },

      clearWorkflow: () => {
        set({
          nodes: [],
          edges: [],
          selectedNodeId: null,
          workflowName: 'Untitled Workflow',
          workflowDescription: '',
        });
      },

      saveExecution: (execution) => {
        set({ lastExecution: execution });
      },

      getLastExecution: () => {
        return get().lastExecution;
      },
    }),
    {
      name: 'microflux-workflow-storage',
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        workflowName: state.workflowName,
        workflowDescription: state.workflowDescription,
        lastExecution: state.lastExecution,
      }),
    }
  )
);
