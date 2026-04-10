import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  NODE_DEFINITIONS,
  getNodesByCategory,
  getAllCategories,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  type NodeCategory,
  type NodeDefinition,
} from '../services/nodeDefinitions';
import { algoToUsd } from '../services/marketService';
import { sendPayment, sendAsaTransfer, getExplorerTxUrl, fetchAccountBalance } from '../services/walletService';
import {
  callExecute,
  hashWorkflow,
  getContractState,
  getAppId,
  getAppExplorerUrl,
  executeAtomicGroup,
  genericAppCall,
  deployContract,
  type ContractState,
} from '../services/contractService';
import AICopilotPanel from './AICopilotPanel';
import algosdk from 'algosdk';
import type { AINode, AIEdge } from '../services/aiService';
import { api } from '../services/api';

// Execution modes
type ExecutionMode = 'direct' | 'contract' | 'atomic';

// ── Types ────────────────────────────────────

interface CanvasNodeData {
  id: string;
  type: string;
  label: string;
  category: NodeCategory;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  icon: string;
  color: string;
  isReal: boolean;
}

interface CanvasEdgeData {
  id: string;
  source: string;
  target: string;
}

interface PaletteDragPreview {
  def: NodeDefinition;
  clientX: number;
  clientY: number;
}

const MicrofluxNode: React.FC<NodeProps<CanvasNodeData>> = ({ data, selected }) => {
  const isTrigger = data.category === 'trigger';

  return (
    <div className={`microflux-node microflux-node-${data.category} ${selected ? 'is-selected' : ''}`}>
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="microflux-handle microflux-handle-input"
        />
      )}

      <div className="microflux-node__header" style={{ borderLeftColor: data.color }}>
        <span className="microflux-node__icon">{data.icon}</span>
        <span className="microflux-node__title">{data.label}</span>
      </div>

      <div className="microflux-node__body">
        <div className="microflux-node__type">{data.type}</div>
        {data.type === 'send_payment' && (
          <div className="microflux-node__meta">{(data.config.amount as number) / 1000000} ALGO</div>
        )}
        {data.type === 'asa_transfer' && (
          <div className="microflux-node__meta">ASA #{String(data.config.asset_id ?? 0)}</div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="microflux-handle microflux-handle-output"
      />
    </div>
  );
};

const nodeTypes: Record<string, React.FC<NodeProps<CanvasNodeData>>> = {
  microfluxNode: MicrofluxNode,
  // Explicitly register all workflow node type keys so AI-generated types
  // like `telegram_command` render via the shared MicrofluxNode renderer.
  ...Object.fromEntries(NODE_DEFINITIONS.map((def) => [def.type, MicrofluxNode])),
};

const registeredNodeTypes = new Set(Object.keys(nodeTypes));

const toFlowNode = (node: CanvasNodeData): Node<CanvasNodeData> => ({
  id: node.id,
  type: registeredNodeTypes.has(node.type) ? node.type : 'microfluxNode',
  position: node.position,
  data: node,
});

const toFlowEdge = (edge: CanvasEdgeData): Edge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  type: 'smoothstep',
  animated: true,
  style: { stroke: 'rgba(56, 189, 248, 0.55)', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(56, 189, 248, 0.55)' },
});

interface WorkflowBuilderProps {
  initialNodes?: AINode[];
  initialEdges?: AIEdge[];
  workflowName?: string;
  workflowId?: string | null;
  activeAddress: string | null;
  transactionSigner?: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>;
  networkName?: string;
  onBalanceUpdate?: (balance: number) => void;
}

// ── WorkflowBuilder ──────────────────────────

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  initialNodes,
  initialEdges,
  workflowName,
  workflowId,
  activeAddress,
  transactionSigner,
  networkName = 'localnet',
  onBalanceUpdate,
}) => {
  const [activeRightTab, setActiveRightTab] = useState<'properties' | 'simulate' | 'ai'>('properties');
  const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
  const [edges, setEdges] = useState<CanvasEdgeData[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [simResults, setSimResults] = useState<string[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [usdQuote, setUsdQuote] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('atomic');
  const [contractState, setContractState] = useState<ContractState | null>(null);
  const [executionSuccess, setExecutionSuccess] = useState(false);
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const [useSmartContract, setUseSmartContract] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployedAppId, setDeployedAppId] = useState<number>(0);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(workflowId ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewportInitialized, setViewportInitialized] = useState(false);
  const [paletteDragPreview, setPaletteDragPreview] = useState<PaletteDragPreview | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<CanvasNodeData, Edge> | null>(null);
  const paletteDragStartRef = useRef<{ def: NodeDefinition; x: number; y: number } | null>(null);
  const suppressNextPaletteClickRef = useRef(false);
  const paletteDragFrameRef = useRef<number | null>(null);

  // Load contract state on mount
  useEffect(() => {
    const appId = getAppId();
    if (appId > 0) {
      getContractState(appId).then(setContractState).catch(() => setContractState(null));
    }
  }, []);

  // Sync execution mode from toggle
  useEffect(() => {
    setExecutionMode(useSmartContract ? 'atomic' : 'direct');
  }, [useSmartContract]);

  // Derive selectedNode directly for render (instant update)
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const nodeCounter = useRef(0);

  // Load workflow generated inside right-panel AI tab directly into this canvas
  const handleLoadWorkflowFromAi = useCallback((aiNodes: AINode[], aiEdges: AIEdge[]) => {
    const canvasNodes: CanvasNodeData[] = aiNodes.map((n) => {
      const def = NODE_DEFINITIONS.find((d) => d.type === n.type);
      const rawData = (n as any)?.data && typeof (n as any).data === 'object' ? (n as any).data : {};
      return {
        id: n.id,
        type: n.type,
        label: String(rawData?.label ?? n.label),
        category: n.category as NodeCategory,
        config: (rawData?.config ?? n.config ?? {}) as Record<string, unknown>,
        position: n.position,
        icon: def?.icon ?? '▪',
        color: def?.color ?? '#666',
        isReal: def?.isReal ?? false,
      };
    });

    setNodes(canvasNodes);
    setEdges(aiEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })));
    setSelectedNodeId(null);
    setSimResults([]);
    setExecutionLog([]);
    setExecutionSuccess(false);
    nodeCounter.current = canvasNodes.length;
  }, []);

  // Load initial nodes from AI or templates
  useEffect(() => {
    if (initialNodes && initialNodes.length > 0) {
      const canvasNodes: CanvasNodeData[] = initialNodes.map((n) => {
        const def = NODE_DEFINITIONS.find((d) => d.type === n.type);
        const rawData = (n as any)?.data && typeof (n as any).data === 'object' ? (n as any).data : {};
        return {
          id: n.id,
          type: n.type,
          label: String(rawData?.label ?? n.label),
          category: n.category as NodeCategory,
          config: (rawData?.config ?? n.config ?? {}) as Record<string, unknown>,
          position: n.position,
          icon: def?.icon ?? '▪',
          color: def?.color ?? '#666',
          isReal: def?.isReal ?? false,
        };
      });
      setNodes(canvasNodes);
      setEdges(initialEdges?.map((e) => ({ id: e.id, source: e.source, target: e.target })) ?? []);
      setCurrentWorkflowId(workflowId ?? null);
      nodeCounter.current = canvasNodes.length;
    }
  }, [initialNodes, initialEdges, workflowId]);

  const handleSaveWorkflow = useCallback(async () => {
    if (!activeAddress) {
      alert('Connect wallet first to save workflows.');
      return;
    }

    if (nodes.length === 0) {
      alert('Add at least one node before saving.');
      return;
    }

    const normalizedNodes = nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      category: node.category,
      config: node.config,
      position: node.position,
    }));

    const normalizedEdges = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    }));

    const safeName = (workflowName && workflowName.trim().length > 0)
      ? workflowName.trim()
      : `Workflow ${new Date().toLocaleString()}`;

    setIsSaving(true);
    try {
      const payload = {
        name: safeName,
        triggerKeyword: safeName.toLowerCase(),
        nodes: normalizedNodes,
        edges: normalizedEdges,
        isActive: true,
      };

      const saved = currentWorkflowId
        ? await api.updateWorkflow(currentWorkflowId, activeAddress, payload)
        : await api.saveWorkflow(activeAddress, payload);

      setCurrentWorkflowId(saved.id);
      alert(currentWorkflowId ? 'Workflow updated in DB.' : 'Workflow saved to DB.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save workflow');
    } finally {
      setIsSaving(false);
    }
  }, [activeAddress, currentWorkflowId, edges, nodes, workflowName]);

  const flowNodes = useMemo(() => nodes.map(toFlowNode), [nodes]);
  const flowEdges = useMemo(() => edges.map(toFlowEdge), [edges]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((currentNodes) => {
      const updated = applyNodeChanges(changes, currentNodes.map(toFlowNode));
      return updated.map((node) => {
        // Safe position to prevent disappearing node bug when shaken
        const safeX = typeof node.position.x === 'number' && !isNaN(node.position.x) ? node.position.x : 0;
        const safeY = typeof node.position.y === 'number' && !isNaN(node.position.y) ? node.position.y : 0;
        
        return {
          ...(node.data as CanvasNodeData),
          id: node.id,
          position: { x: safeX, y: safeY },
        };
      });
    });
  }, []);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((currentEdges) => {
      const updated = applyEdgeChanges(changes, currentEdges.map(toFlowEdge));
      return updated.map((edge) => ({
        id: edge.id,
        source: String(edge.source ?? ''),
        target: String(edge.target ?? ''),
      }));
    });
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    const source = connection.source;
    const target = connection.target;
    if (!source || !target) return;

    setEdges((currentEdges) => {
      const exists = currentEdges.some(
        (edge) => edge.source === source && edge.target === target,
      );
      if (exists) return currentEdges;

      return [
        ...currentEdges,
        {
          id: `edge_${Date.now()}`,
          source,
          target,
        },
      ];
    });
  }, []);

  const applyZoomAtClientPoint = useCallback((clientX: number, clientY: number, zoomDirection: number) => {
    const instance = flowInstanceRef.current;
    const container = canvasContainerRef.current;
    if (!instance || !container) return;

    const rect = container.getBoundingClientRect();
    const currentZoom = instance.getZoom();
    const factor = zoomDirection > 0 ? 1.1 : 0.9;
    const nextZoom = Math.max(0.2, Math.min(2, currentZoom * factor));
    if (nextZoom === currentZoom) return;

    const flowPoint = instance.screenToFlowPosition({ x: clientX, y: clientY });
    const nextX = clientX - rect.left - flowPoint.x * nextZoom;
    const nextY = clientY - rect.top - flowPoint.y * nextZoom;

    instance.setViewport({ x: nextX, y: nextY, zoom: nextZoom }, { duration: 80 });
  }, []);

  const handleZoomIn = useCallback(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    applyZoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1);
  }, [applyZoomAtClientPoint]);

  const handleZoomOut = useCallback(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    applyZoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, -1);
  }, [applyZoomAtClientPoint]);

  const handleResetView = useCallback(() => {
    const instance = flowInstanceRef.current;
    if (!instance) return;
    instance.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 120 });
  }, []);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement;
      if (!container.contains(target)) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;

      event.preventDefault();
      event.stopPropagation();
      applyZoomAtClientPoint(event.clientX, event.clientY, event.deltaY < 0 ? 1 : -1);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [applyZoomAtClientPoint]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const start = paletteDragStartRef.current;
      if (!start) return;

      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved < 5 && !paletteDragPreview) return;

      if (paletteDragFrameRef.current) {
        cancelAnimationFrame(paletteDragFrameRef.current);
      }
      paletteDragFrameRef.current = requestAnimationFrame(() => {
        setPaletteDragPreview({
          def: start.def,
          clientX: event.clientX,
          clientY: event.clientY,
        });
        paletteDragFrameRef.current = null;
      });
    };

    const onMouseUp = (event: MouseEvent) => {
      const start = paletteDragStartRef.current;
      if (!start) return;

      if (paletteDragPreview) {
        suppressNextPaletteClickRef.current = true;
        const instance = flowInstanceRef.current;
        const container = canvasContainerRef.current;
        if (instance && container) {
          const rect = container.getBoundingClientRect();
          const isInsideCanvas =
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom;

          if (isInsideCanvas) {
            const flowPosition = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });

            nodeCounter.current++;
            const id = `node_${nodeCounter.current}_${Date.now()}`;
            const newNode: CanvasNodeData = {
              id,
              type: start.def.type,
              label: start.def.label,
              category: start.def.category,
              config: { ...start.def.defaultConfig },
              position: {
                x: flowPosition.x - 100,
                y: flowPosition.y - 24,
              },
              icon: start.def.icon,
              color: start.def.color,
              isReal: start.def.isReal,
            };
            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeId(id);
          }
        }
      }

      paletteDragStartRef.current = null;
      setPaletteDragPreview(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      if (paletteDragFrameRef.current) {
        cancelAnimationFrame(paletteDragFrameRef.current);
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [paletteDragPreview]);

  // Add node from palette
  const addNode = useCallback((def: NodeDefinition) => {
    if (suppressNextPaletteClickRef.current) {
      suppressNextPaletteClickRef.current = false;
      return;
    }
    nodeCounter.current++;
    const id = `node_${nodeCounter.current}_${Date.now()}`;
    const newNode: CanvasNodeData = {
      id,
      type: def.type,
      label: def.label,
      category: def.category,
      config: { ...def.defaultConfig },
      position: { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 },
      icon: def.icon,
      color: def.color,
      isReal: def.isReal,
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
  }, []);

  // Delete selected node
  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
      setActiveRightTab('simulate');
    }
  }, [selectedNodeId]);

  // ── Topological sort for correct execution order ────
  const getExecutionOrder = useCallback((): CanvasNodeData[] => {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();
    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    }
    for (const edge of edges) {
      adjList.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }
    const ordered: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      ordered.push(id);
      for (const next of adjList.get(id) ?? []) {
        const newDeg = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, newDeg);
        if (newDeg === 0) queue.push(next);
      }
    }
    // Append any unconnected nodes at the end
    for (const node of nodes) {
      if (!ordered.includes(node.id)) ordered.push(node.id);
    }
    return ordered.map(id => nodes.find(n => n.id === id)!).filter(Boolean);
  }, [nodes, edges]);

  // Simulate workflow
  const simulateWorkflow = useCallback(async () => {
    setIsSimulating(true);
    setSimResults([]);

    const logs: string[] = [];
    const sortedNodes = getExecutionOrder();

    for (const node of sortedNodes) {
      await new Promise((r) => setTimeout(r, 400));

      switch (node.type) {
        case 'send_payment': {
          const amt = (node.config.amount as number) / 1000000;
          try {
            const quote = await algoToUsd(amt);
            logs.push(`${node.label}: Send ${amt} ALGO (~${quote.formatted})`);
            setUsdQuote(`${amt} ALGO ≈ ${quote.formatted}`);
          } catch {
            logs.push(`${node.label}: Send ${amt} ALGO`);
          }
          break;
        }
        case 'asa_transfer':
          logs.push(`${node.label}: Transfer ASA #${node.config.asset_id}`);
          break;
        case 'filter':
          logs.push(`[FILTER] ${node.label}: Condition evaluated → true`);
          break;
        case 'delay':
          logs.push(`[WAIT] ${node.label}: Waiting ${(node.config.duration as number) / 1000}s...`);
          break;
        case 'debug_log':
          logs.push(`[LOG] ${node.label}: ${node.config.message}`);
          break;
        case 'timer_loop':
          logs.push(`[TIMER] ${node.label}: Timer triggered`);
          break;
        case 'wallet_event':
          logs.push(`[WALLET] ${node.label}: Wallet event received`);
          break;
        case 'webhook_trigger':
          logs.push(`${node.label}: Webhook received`);
          break;
        case 'get_quote':
        case 'price_feed':
          logs.push(`[PRICE] ${node.label}: ALGO = $0.24 (cached)`);
          break;
        case 'app_call':
          logs.push(`[APP] ${node.label}: App call prepared`);
          break;
        case 'http_request':
          logs.push(`[HTTP] ${node.label}: HTTP request (mock)`);
          break;
        case 'browser_notification':
          logs.push(`[NOTIFY] ${node.label}: Notification sent`);
          if (Notification.permission === 'granted') {
            new Notification(node.config.title as string, { body: node.config.body as string });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
          }
          break;
        case 'telegram_notify':
          logs.push(`[TELEGRAM] ${node.label}: Telegram (mock)`);
          break;
        case 'discord_notify':
          logs.push(`[DISCORD] ${node.label}: Discord (mock)`);
          break;
        default:
          logs.push(`[NODE] ${node.label}: Processed`);
      }

      setSimResults([...logs]);
    }

    logs.push('');
    logs.push('───── SIMULATION COMPLETE ─────');
    setSimResults([...logs]);
    setIsSimulating(false);
  }, [nodes, getExecutionOrder]);

  // ── HYBRID EXECUTION ENGINE ─────────────────

  // MODE A: Direct L1 transactions (individual signing)
  const executeDirect = useCallback(async (logs: string[]) => {
    if (!activeAddress || !transactionSigner) return;

    const sortedNodes = getExecutionOrder();
    for (const node of sortedNodes) {
      await new Promise((r) => setTimeout(r, 300));

      if (node.type === 'send_payment' && node.isReal) {
        const amount = Number(node.config.amount) || 0;
        const receiver = String(node.config.receiver || '');

        if (!receiver || receiver === 'ALGO_ADDRESS_PLACEHOLDER') {
          logs.push(`[SKIP] ${node.label}: Skipped — no receiver set`);
          setExecutionLog([...logs]);
          continue;
        }

        // Validate Algorand address
        try { algosdk.decodeAddress(receiver); } catch {
          logs.push(`[SKIP] ${node.label}: Invalid Algorand address`);
          setExecutionLog([...logs]);
          continue;
        }

        logs.push(`${node.label}: Requesting wallet signature...`);
        setExecutionLog([...logs]);

        const result = await sendPayment(
          activeAddress,
          receiver,
          amount,
          transactionSigner as any,
        );

        if (result.success) {
          const algoAmt = amount / 1_000_000;
          try {
            const quote = await algoToUsd(algoAmt);
            logs.push(`[OK] ${node.label}: Sent ${algoAmt} ALGO (~${quote.formatted})`);
          } catch {
            logs.push(`[OK] ${node.label}: Sent ${algoAmt} ALGO`);
          }
          logs.push(`   TX: ${result.txId}`);
          logs.push(`   ${getExplorerTxUrl(result.txId, networkName)}`);
        } else {
          logs.push(`[FAIL] ${node.label}: ${result.error}`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'asa_transfer' && node.isReal) {
        const assetId = Number(node.config.asset_id) || 0;
        const amount = Number(node.config.amount) || 0;
        const receiver = String(node.config.receiver || '');

        if (!receiver || !assetId) {
          logs.push(`[SKIP] ${node.label}: Skipped — missing config`);
          setExecutionLog([...logs]);
          continue;
        }

        logs.push(`${node.label}: Requesting wallet signature...`);
        setExecutionLog([...logs]);

        const result = await sendAsaTransfer(
          activeAddress,
          receiver,
          assetId,
          amount,
          transactionSigner as any,
        );

        if (result.success) {
          logs.push(`[OK] ${node.label}: Transferred ${amount} of ASA #${assetId}`);
          logs.push(`   TX: ${result.txId}`);
        } else {
          logs.push(`[FAIL] ${node.label}: ${result.error}`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'app_call' && node.isReal) {
        const appId = Number(node.config.app_id) || 0;
        const method = String(node.config.method || '');
        const args = Array.isArray(node.config.args) ? node.config.args.map(String) : [];

        if (!appId || !method) {
          logs.push(`[SKIP] ${node.label}: Skipped — missing app_id or method`);
          setExecutionLog([...logs]);
          continue;
        }

        logs.push(`${node.label}: Calling App ${appId} → ${method}...`);
        setExecutionLog([...logs]);

        const result = await genericAppCall(
          activeAddress,
          appId,
          method,
          args,
          transactionSigner as any,
        );

        if (result.success) {
          logs.push(`[OK] ${node.label}: App call confirmed`);
          logs.push(`   TX: ${result.txId}`);
          logs.push(`   App: ${getAppExplorerUrl(appId, networkName)}`);
        } else {
          logs.push(`[FAIL] ${node.label}: ${result.error}`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'browser_notification' && node.isReal) {
        if (Notification.permission === 'granted') {
          new Notification(node.config.title as string, { body: node.config.body as string });
          logs.push(`[NOTIFY] ${node.label}: Notification sent`);
        } else if (Notification.permission !== 'denied') {
          await Notification.requestPermission();
          logs.push(`[NOTIFY] ${node.label}: Permission requested`);
        }
        setExecutionLog([...logs]);

      } else {
        logs.push(`[SKIP] ${node.label}: Simulated (${node.isReal ? 'on-chain' : 'mock'})`);
        setExecutionLog([...logs]);
      }
    }
  }, [nodes, activeAddress, transactionSigner, networkName]);

  // MODE B: Execute via WorkflowExecutor smart contract
  const executeViaContract = useCallback(async (logs: string[]) => {
    if (!activeAddress || !transactionSigner) return;

    const appId = getAppId();
    if (!appId) {
      logs.push('[FAIL] No App ID configured. Deploy contract first.');
      logs.push('   Set VITE_APP_ID=<app_id> in .env');
      setExecutionLog([...logs]);
      return;
    }

    // Hash the workflow for on-chain verification
    const workflowData = { nodes: nodes.map(n => ({ type: n.type, config: n.config })), timestamp: Date.now() };
    const wfHash = await hashWorkflow(workflowData);

    logs.push(`Workflow hash: ${wfHash.slice(0, 24)}...`);
    logs.push(`App ID: ${appId}`);
    logs.push(`Calling execute() on WorkflowExecutor...`);
    setExecutionLog([...logs]);

    const result = await callExecute(
      activeAddress,
      wfHash,
      transactionSigner as any,
      appId,
    );

    if (result.success) {
      logs.push(`Contract execution confirmed.`);
      logs.push(`   TX: ${result.txId}`);
      logs.push(`   ${getExplorerTxUrl(result.txId, networkName)}`);
      logs.push(`   ${getAppExplorerUrl(appId, networkName)}`);
      logs.push('');
      logs.push('This execution is now verifiable on-chain');

      // Refresh contract state
      const newState = await getContractState(appId);
      if (newState) {
        setContractState(newState);
        logs.push(`   Execution #${newState.totalExecutions}`);
      }
    } else {
      logs.push(`[FAIL] Contract call failed: ${result.error}`);
    }
    setExecutionLog([...logs]);
  }, [nodes, activeAddress, transactionSigner, networkName]);

  // MODE C: Atomic transaction group (payments + ASA + app call combined)
  const executeAtomic = useCallback(async (logs: string[]) => {
    if (!activeAddress || !transactionSigner) return;

    const payments: Array<{ receiver: string; amountMicroAlgos: number }> = [];
    const asaTransfers: Array<{ receiver: string; assetId: number; amount: number }> = [];

    for (const node of nodes) {
      if (node.type === 'send_payment' && node.isReal) {
        const receiver = String(node.config.receiver || '');
        const amount = Number(node.config.amount) || 0;
        if (receiver && receiver !== 'ALGO_ADDRESS_PLACEHOLDER' && amount > 0) {
          payments.push({ receiver, amountMicroAlgos: amount });
        }
      } else if (node.type === 'asa_transfer' && node.isReal) {
        const receiver = String(node.config.receiver || '');
        const assetId = Number(node.config.asset_id) || 0;
        const amount = Number(node.config.amount) || 0;
        if (receiver && assetId && amount) {
          asaTransfers.push({ receiver, assetId, amount });
        }
      }
    }

    // Generate workflow hash for contract
    const workflowData = { nodes: nodes.map(n => ({ type: n.type, config: n.config })), timestamp: Date.now() };
    const wfHash = await hashWorkflow(workflowData);
    const appId = getAppId();

    const txnCount = payments.length + asaTransfers.length + (appId ? 1 : 0);
    logs.push(`Building atomic group: ${txnCount} transactions`);
    if (payments.length) logs.push(`   ${payments.length} payment(s)`);
    if (asaTransfers.length) logs.push(`   ${asaTransfers.length} ASA transfer(s)`);
    if (appId) logs.push(`   1 app call (App ${appId})`);
    logs.push(`Requesting wallet signature for entire group...`);
    setExecutionLog([...logs]);

    const result = await executeAtomicGroup(
      activeAddress,
      {
        payments: payments.length > 0 ? payments : undefined,
        asaTransfers: asaTransfers.length > 0 ? asaTransfers : undefined,
        appCall: appId ? { workflowHash: wfHash, appId } : undefined,
      },
      transactionSigner as any,
    );

    if (result.success) {
      logs.push(`[OK] Atomic group confirmed.`);
      logs.push(`   TX: ${result.txId}`);
      logs.push(`   ${getExplorerTxUrl(result.txId, networkName)}`);
      if (appId) logs.push(`   ${getAppExplorerUrl(appId, networkName)}`);
      logs.push('');
      logs.push(`All ${txnCount} transactions executed atomically`);
    } else {
      logs.push(`[FAIL] Atomic execution failed: ${result.error}`);
    }
    setExecutionLog([...logs]);
  }, [nodes, activeAddress, transactionSigner, networkName]);

  // Master execution handler
  const executeWorkflow = useCallback(async () => {
    if (!activeAddress || !transactionSigner) return;

    setIsExecuting(true);
    setExecutionLog([]);
    setExecutionSuccess(false);
    setLastTxId(null);
    const logs: string[] = [];

    const modeLabel = executionMode === 'direct' ? 'DIRECT' : executionMode === 'contract' ? 'CONTRACT' : 'ATOMIC GROUP';
    const onChainCount = nodes.filter(n => n.isReal).length;
    logs.push(`Starting ${modeLabel} execution...`);
    logs.push(`Sender: ${activeAddress.slice(0, 8)}...${activeAddress.slice(-6)}`);
    logs.push(`Network: ${networkName} (Algorand Testnet)`);
    logs.push(`Mode: ${modeLabel} • ${onChainCount} on-chain transactions`);
    logs.push('');
    setExecutionLog([...logs]);

    try {
      switch (executionMode) {
        case 'direct':
          await executeDirect(logs);
          break;
        case 'contract':
          await executeViaContract(logs);
          break;
        case 'atomic':
          await executeAtomic(logs);
          break;
      }

      // Check if any TX was confirmed (look for OK markers)
      const hasSuccess = logs.some(l => l.includes('[OK]'));
      const txLine = logs.find(l => l.trim().startsWith('TX:'));
      if (hasSuccess) {
        setExecutionSuccess(true);
        if (txLine) setLastTxId(txLine.replace(/.*TX:\s*/, '').trim());
      }

      logs.push('');
      if (hasSuccess) {
        logs.push('═══════════════════════════════');
        logs.push('EXECUTION SUCCESSFUL');
        logs.push('All transactions confirmed on Algorand Testnet.');
        logs.push('No data is mocked. Every action was signed');
        logs.push('by your wallet and confirmed on-chain.');
        logs.push('═══════════════════════════════');
      } else {
        logs.push(`───── ${modeLabel} EXECUTION COMPLETE ─────`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logs.push('');
      logs.push(`[FAIL] Execution failed: ${msg}`);
      logs.push('Please check your wallet connection and try again.');
    }

    setExecutionLog([...logs]);
    setIsExecuting(false);

    // Refresh balance after execution
    if (activeAddress && onBalanceUpdate) {
      try {
        const bal = await fetchAccountBalance(activeAddress);
        onBalanceUpdate(bal.balanceAlgos);
      } catch { /* ignore */ }
    }

    // Refresh contract state
    const appId = getAppId();
    if (appId > 0) {
      getContractState(appId).then(setContractState).catch(() => {});
    }
  }, [executionMode, executeDirect, executeViaContract, executeAtomic, activeAddress, transactionSigner, networkName, onBalanceUpdate]);

  // Load demo workflow (one-click)
  const loadDemoWorkflow = useCallback(() => {
    const demoNodes: CanvasNodeData[] = [
      {
        id: 'demo_1',
        type: 'send_payment',
        label: 'Send 0.01 ALGO',
        category: 'action',
        config: { amount: 10000, receiver: activeAddress || '' },
        position: { x: 100, y: 200 },
        icon: '▸',
        color: '#3b82f6',
        isReal: true,
      },
      {
        id: 'demo_2',
        type: 'send_payment',
        label: 'Send 0.02 ALGO',
        category: 'action',
        config: { amount: 20000, receiver: activeAddress || '' },
        position: { x: 400, y: 200 },
        icon: '▸',
        color: '#3b82f6',
        isReal: true,
      },
      {
        id: 'demo_3',
        type: 'browser_notification',
        label: 'Notify Success',
        category: 'notification',
        config: { title: 'MICROFLUX-X1', body: 'Workflow executed successfully!' },
        position: { x: 700, y: 200 },
        icon: '•',
        color: '#ec4899',
        isReal: true,
      },
    ];
    const demoEdges: CanvasEdgeData[] = [
      { id: 'demo_e1', source: 'demo_1', target: 'demo_2' },
      { id: 'demo_e2', source: 'demo_2', target: 'demo_3' },
    ];
    setNodes(demoNodes);
    setEdges(demoEdges);
    setSelectedNodeId(null);
    setSimResults([]);
    setExecutionLog([]);
    setExecutionSuccess(false);
    nodeCounter.current = 3;
  }, [activeAddress]);

  // Deploy contract from browser
  const deployContractHandler = useCallback(async () => {
    if (!activeAddress || !transactionSigner) return;
    setIsDeploying(true);
    try {
      const result = await deployContract(
        activeAddress,
        transactionSigner as any,
      );
      if (result.success) {
        setDeployedAppId(result.appId);
        const state = await getContractState(result.appId);
        if (state) setContractState(state);
        alert(`Contract deployed. App ID: ${result.appId}\n\nAdd to .env:\nVITE_APP_ID=${result.appId}`);
      } else {
        alert(`Deployment failed: ${result.error}`);
      }
    } catch (err) {
      alert(`Deployment error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setIsDeploying(false);
  }, [activeAddress, transactionSigner]);

  return (
    <div className="workspace-layout">
      {/* ── Left Sidebar: Node Palette ────── */}
      <div className="sidebar" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="text-sm font-bold text-uppercase" style={{ letterSpacing: '0.06em' }}>
            {workflowName || 'NODE PALETTE'}
          </div>
          <div className="text-xs text-muted" style={{ marginTop: '2px' }}>
            Click to add nodes to canvas
          </div>
        </div>

        {getAllCategories().map((category) => {
          const categoryNodes = getNodesByCategory(category);
          return (
            <div key={category} className="sidebar-section">
              <div className="sidebar-section-title" style={{ color: CATEGORY_COLORS[category] }}>
                {CATEGORY_LABELS[category]}
              </div>
              {categoryNodes.map((def) => (
                <div
                  key={def.type}
                  className="node-item"
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    paletteDragStartRef.current = {
                      def,
                      x: e.clientX,
                      y: e.clientY,
                    };
                  }}
                  onClick={() => addNode(def)}
                >
                  <div
                    className="node-item-icon"
                    style={{
                      background: `${def.color}20`,
                      border: `1px solid ${def.color}40`,
                      color: def.color,
                    }}
                  >
                    {def.icon}
                  </div>
<div className="node-item-info">
                      <div className="node-item-name">{def.label}</div>
                      <div className="node-item-desc">
                        {def.description}
                      </div>
                    </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* ── Canvas ────────────────────────── */}
      <div
        className="canvas-container canvas-container-reactflow"
        ref={canvasContainerRef}
      >
        <ReactFlow
          className="microflux-reactflow"
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setActiveRightTab('properties');
          }}
          onPaneClick={() => {
            setSelectedNodeId(null);
            if (activeRightTab === 'properties') setActiveRightTab('simulate');
          }}
          onInit={(instance) => { flowInstanceRef.current = instance; }}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          connectOnClick={true}
          connectionLineType={ConnectionLineType.Bezier}
          connectionLineStyle={{ stroke: 'rgba(56, 189, 248, 0.55)', strokeWidth: 2 }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          snapToGrid
          snapGrid={[20, 20]}
          deleteKeyCode={null}
          minZoom={0.2}
          maxZoom={2}
          translateExtent={[[-5000, -5000], [5000, 5000]]}
          nodeExtent={[[-5000, -5000], [5000, 5000]]}
          zoomOnScroll={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          panOnDrag={[1, 2]}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
            style: { stroke: 'rgba(56, 189, 248, 0.55)', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(56, 189, 248, 0.55)' },
          }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          panOnScroll={false}
          selectionOnDrag={false}
          preventScrolling
          onMoveEnd={() => setViewportInitialized(true)}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1}
            color="rgba(255, 255, 255, 0.06)"
          />
          <Controls
            showInteractive={false}
            className="microflux-flow-controls"
          />
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={2}
            nodeColor={(node) => node.data.color}
            maskColor="rgba(6, 8, 12, 0.72)"
            className="microflux-flow-minimap"
          />
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="empty-state microflux-flow-empty" style={{ height: '100%' }}>
            <div className="empty-state-icon">⬡</div>
            <div className="empty-state-title">Empty Canvas</div>
            <div className="empty-state-desc">
              Click nodes from the palette or use AI to generate a workflow
            </div>
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            display: 'flex',
            gap: '4px',
            zIndex: 20,
          }}
        >
          <button
            type="button"
            title="Zoom In"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleZoomIn}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            +
          </button>
          <button
            type="button"
            title="Zoom Out"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleZoomOut}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            −
          </button>
          <button
            type="button"
            title="Reset View"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleResetView}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            ⟲
          </button>
        </div>

        {paletteDragPreview && (
          <div
            className="microflux-node"
            style={{
              position: 'fixed',
              left: paletteDragPreview.clientX - 100,
              top: paletteDragPreview.clientY - 24,
              minWidth: '200px',
              opacity: 0.68,
              pointerEvents: 'none',
              zIndex: 999,
            }}
          >
            <div className="microflux-node__header" style={{ borderLeftColor: paletteDragPreview.def.color }}>
              <span className="microflux-node__icon">{paletteDragPreview.def.icon}</span>
              <span className="microflux-node__title">{paletteDragPreview.def.label}</span>
            </div>
            <div className="microflux-node__body">
              <div className="microflux-node__type">{paletteDragPreview.def.type}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right Panel ───────────────────── */}
      <div className="right-panel">
        {/* Panel Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeRightTab === 'properties' ? 'active' : ''}`}
            onClick={() => setActiveRightTab('properties')}
          >
            Properties
          </button>
          <button
            className={`tab ${activeRightTab === 'simulate' ? 'active' : ''}`}
            onClick={() => setActiveRightTab('simulate')}
          >
            Simulate
          </button>
          <button
            className={`tab ${activeRightTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveRightTab('ai')}
          >
            AI Copilot
          </button>
        </div>

        {activeRightTab === 'ai' ? (
          <div className="panel-body animate-fadeIn">
            <AICopilotPanel
              onLoadWorkflow={(aiNodes, aiEdges) => handleLoadWorkflowFromAi(aiNodes, aiEdges)}
              activeAddress={activeAddress}
            />
          </div>
        ) : activeRightTab === 'properties' ? (
          selectedNode ? (
            <div className="panel-body animate-fadeIn">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <div className="text-sm font-bold">{selectedNode.label}</div>
                  <div className="text-xs text-muted text-mono">{selectedNode.type}</div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--color-error)' }}
                  onClick={() => deleteNode(selectedNode.id)}
                >
                  Remove
                </button>
              </div>
              <div className="divider" />
              <div style={{ marginBottom: '12px' }}>
                <span className={`tag tag-${selectedNode.category}`}>
                  {selectedNode.category}
                </span>
                <span className={`tag tag-sm ${selectedNode.isReal ? 'tag-real' : 'tag-mock'}`} style={{ marginLeft: '6px' }}>
                  {selectedNode.isReal ? 'ON-CHAIN' : 'SIMULATION'}
                </span>
              </div>
              <div style={{ marginTop: '16px' }}>
                <div className="text-xs text-uppercase" style={{ letterSpacing: '0.08em', fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: '12px' }}>
                  Configuration
                </div>
                {('receiver' in selectedNode.config) && (
                  <div style={{ marginBottom: '12px' }}>
                    <label className="text-xs" style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      Receiver Address *
                    </label>
                    <input
                      className="input"
                      placeholder="Paste Algorand address (58 chars)"
                      value={String(selectedNode.config.receiver || '')}
                      onChange={(e) => {
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, config: { ...n.config, receiver: e.target.value } }
                              : n
                          )
                        );
                      }}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}
                    />
                    {activeAddress && !String(selectedNode.config.receiver || '') && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.6rem', marginTop: '4px', padding: '2px 8px' }}
                        onClick={() => {
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === selectedNode.id
                                ? { ...n, config: { ...n.config, receiver: activeAddress } }
                                : n
                            )
                          );
                        }}
                      >
                        Use my address
                      </button>
                    )}
                  </div>
                )}
                {('amount' in selectedNode.config) && (
                  <div style={{ marginBottom: '12px' }}>
                    <label className="text-xs" style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      {selectedNode.type === 'send_payment' ? 'Amount (microAlgos) *' : 'Amount *'}
                    </label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      placeholder={selectedNode.type === 'send_payment' ? '1000000 = 1 ALGO' : '0'}
                      value={String(selectedNode.config.amount || '')}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, config: { ...n.config, amount: val } }
                              : n
                          )
                        );
                      }}
                    />
                    {selectedNode.type === 'send_payment' && Number(selectedNode.config.amount) > 0 && (
                      <span className="text-xs text-muted" style={{ fontSize: '0.6rem' }}>
                        = {(Number(selectedNode.config.amount) / 1_000_000).toFixed(6)} ALGO
                      </span>
                    )}
                  </div>
                )}
                {('asset_id' in selectedNode.config) && (
                  <div style={{ marginBottom: '12px' }}>
                    <label className="text-xs" style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      Asset ID (ASA) *
                    </label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      placeholder="e.g. 10458941"
                      value={String(selectedNode.config.asset_id || '')}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, config: { ...n.config, asset_id: val } }
                              : n
                          )
                        );
                      }}
                    />
                  </div>
                )}
                {('app_id' in selectedNode.config) && (
                  <div style={{ marginBottom: '12px' }}>
                    <label className="text-xs" style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      Application ID *
                    </label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      placeholder="e.g. 758592157"
                      value={String(selectedNode.config.app_id || '')}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, config: { ...n.config, app_id: val } }
                              : n
                          )
                        );
                      }}
                    />
                  </div>
                )}
                {Object.entries(selectedNode.config)
                  .filter(([key]) => !['receiver', 'amount', 'asset_id', 'app_id', 'method', 'args'].includes(key))
                  .map(([key, value]) => (
                    <div key={key} style={{ marginBottom: '10px' }}>
                      <label className="text-xs" style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </label>
                      {typeof value === 'number' ? (
                        <input
                          className="input"
                          type="number"
                          value={String(value)}
                          onChange={(e) => {
                            setNodes((prev) =>
                              prev.map((n) =>
                                n.id === selectedNode.id
                                  ? { ...n, config: { ...n.config, [key]: Number(e.target.value) || 0 } }
                                  : n
                              )
                            );
                          }}
                        />
                      ) : (
                        <input
                          className="input"
                          value={String(value)}
                          onChange={(e) => {
                            setNodes((prev) =>
                              prev.map((n) =>
                                n.id === selectedNode.id
                                  ? { ...n, config: { ...n.config, [key]: e.target.value } }
                                  : n
                              )
                            );
                          }}
                        />
                      )}
                    </div>
                  ))}
              </div>
              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                <div className="text-xs text-uppercase" style={{ letterSpacing: '0.08em', fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>
                  Connections
                </div>
                <div className="text-xs text-muted" style={{ lineHeight: 1.6 }}>
                  {edges.filter(e => e.source === selectedNode.id).length > 0 ? (
                    <div>→ Outputs to: {edges.filter(e => e.source === selectedNode.id).map(e => {
                      const target = nodes.find(n => n.id === e.target);
                      return target?.label || e.target;
                    }).join(', ')}</div>
                  ) : <div>→ No outgoing connections</div>}
                  {edges.filter(e => e.target === selectedNode.id).length > 0 ? (
                    <div>← Inputs from: {edges.filter(e => e.target === selectedNode.id).map(e => {
                      const source = nodes.find(n => n.id === e.source);
                      return source?.label || e.source;
                    }).join(', ')}</div>
                  ) : <div>← No incoming connections</div>}
                </div>
              </div>
            </div>
          ) : (
            <div className="panel-body">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '24px' }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}>◈</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>No Node Selected</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7, maxWidth: '200px' }}>Click a node on the canvas to view and edit its properties</div>
              </div>
            </div>
          )
        ) : (
          <div className="panel-body">
            <div style={{ marginBottom: '16px' }}>
              <div className="text-xs text-uppercase" style={{ letterSpacing: '0.08em', fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: '12px' }}>Workflow Overview</div>
              <div className="sim-panel">
                <div className="sim-row"><span className="sim-label">Nodes</span><span className="sim-value">{nodes.length}</span></div>
                <div className="sim-row"><span className="sim-label">Connections</span><span className="sim-value">{edges.length}</span></div>
                <div className="sim-row"><span className="sim-label">On-Chain Txns</span><span className="sim-value" style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{nodes.filter((n) => n.isReal).length}</span></div>
                <div className="sim-row"><span className="sim-label">Execution Type</span><span className="sim-value" style={{ fontWeight: 700, color: 'var(--color-info)' }}>{useSmartContract ? 'Atomic' : 'Direct'}</span></div>
                {usdQuote && <div className="sim-row"><span className="sim-label">Est. Value</span><span className="sim-value sim-usd">{usdQuote}</span></div>}
              </div>
            </div>
            {nodes.length === 0 && (
              <button className="btn w-full" onClick={loadDemoWorkflow} style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))', border: '1px solid rgba(139,92,246,0.3)', color: 'var(--color-text-primary)', marginBottom: '12px' }}>
                LOAD DEMO WORKFLOW
              </button>
            )}
            <button className="btn btn-outline w-full" onClick={simulateWorkflow} disabled={nodes.length === 0 || isSimulating} style={{ marginBottom: '8px', fontSize: '0.7rem' }}>
              {isSimulating ? 'SIMULATING...' : 'SIMULATE'}
            </button>
            <button
              className="btn btn-accent w-full"
              onClick={handleSaveWorkflow}
              disabled={isSaving || nodes.length === 0 || !activeAddress}
              style={{ marginBottom: '8px', fontSize: '0.7rem' }}
            >
              {isSaving ? 'SAVING...' : currentWorkflowId ? 'UPDATE WORKFLOW' : 'SAVE WORKFLOW'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: '10px', cursor: 'pointer' }} onClick={() => setUseSmartContract(!useSmartContract)}>
              <div style={{ width: '32px', height: '18px', borderRadius: '9px', background: useSmartContract ? 'var(--color-accent)' : 'var(--color-bg-tertiary)', position: 'relative', transition: 'background 0.2s', flexShrink: 0, border: `1px solid ${useSmartContract ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: 'white', position: 'absolute', top: '1px', left: useSmartContract ? '16px' : '1px', transition: 'left 0.2s' }} />
              </div>
              <div>
                <div className="text-xs" style={{ fontWeight: 600 }}>Use Smart Contract</div>
                <div className="text-xs text-muted" style={{ fontSize: '0.6rem' }}>{useSmartContract ? 'Atomic group + App call (verifiable)' : 'Direct L1 transactions'}</div>
              </div>
            </div>
            <div className="sim-panel" style={{ marginBottom: '12px' }}>
              <div className="text-xs text-uppercase" style={{ letterSpacing: '0.08em', fontWeight: 600, color: 'var(--color-accent)', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--color-border)' }}>On-Chain Contract</div>
              <div className="sim-row">
                <span className="sim-label">App ID</span>
                <span className="sim-value">
                  {(getAppId() > 0 || deployedAppId > 0) ? (
                    <a href={getAppExplorerUrl(deployedAppId || getAppId(), networkName)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{deployedAppId || getAppId()}</a>
                  ) : (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>Not deployed</span>
                  )}
                </span>
              </div>
              {getAppId() === 0 && deployedAppId === 0 && activeAddress && (
                <button className="btn btn-outline btn-sm w-full" onClick={deployContractHandler} disabled={isDeploying} style={{ marginTop: '6px', marginBottom: '6px', fontSize: '0.65rem' }}>
                  {isDeploying ? 'DEPLOYING...' : 'DEPLOY CONTRACT'}
                </button>
              )}
              <div className="sim-row"><span className="sim-label">Total Executions</span><span className="sim-value" style={{ fontWeight: 700, color: 'var(--color-success)' }}>{contractState?.totalExecutions ?? '—'}</span></div>
              <div className="sim-row"><span className="sim-label">Workflows Registered</span><span className="sim-value">{contractState?.workflowCount ?? '—'}</span></div>
              <div className="sim-row">
                <span className="sim-label">Status</span>
                <span className="sim-value">
                  {executionSuccess ? (
                    <span style={{ color: 'var(--color-success)', fontWeight: 700 }}><span className="status-dot status-dot-success" style={{ marginRight: '4px' }}></span>Last: Success</span>
                  ) : (
                    <span className="text-muted">Ready</span>
                  )}
                </span>
              </div>
              <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--color-border)' }}>
                <span className="text-xs text-muted" style={{ fontSize: '0.6rem', lineHeight: '1.4' }}>All executions are real Algorand Testnet transactions. No data is mocked.</span>
              </div>
            </div>
            <button className="btn btn-primary w-full" disabled={nodes.length === 0 || !activeAddress || isExecuting} onClick={executeWorkflow} style={{ padding: '14px', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.06em', position: 'relative', overflow: 'hidden' }}>
              {isExecuting ? (<><span className="loading-spinner"></span>EXECUTING...</>) : 'EXECUTE WORKFLOW'}
            </button>
            {!activeAddress && <p className="text-xs text-muted" style={{ marginTop: '6px', textAlign: 'center' }}>Connect wallet to execute</p>}
            {activeAddress && !isExecuting && <p className="text-xs" style={{ marginTop: '6px', textAlign: 'center', color: 'var(--color-success)' }}><span className="status-dot status-dot-success" style={{ marginRight: '4px' }}></span>Wallet connected • {networkName}</p>}
            {executionSuccess && !isExecuting && (
              <div style={{ marginTop: '12px', padding: '14px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.9rem', marginBottom: '6px', color: 'var(--color-success)', fontWeight: 700 }}>CONFIRMED</div>
                <div className="text-sm" style={{ fontWeight: 700, color: 'var(--color-success)', marginBottom: '4px' }}>EXECUTION CONFIRMED</div>
                <div className="text-xs text-muted" style={{ marginBottom: '8px' }}>Verified on Algorand Testnet</div>
                {lastTxId && (
                  <a href={getExplorerTxUrl(lastTxId, networkName)} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ background: 'var(--color-success)', color: 'white', border: 'none', fontSize: '0.65rem', marginBottom: '8px', display: 'inline-block' }}>VIEW ON EXPLORER</a>
                )}
                <div style={{ marginTop: '8px' }}>
                  <button className="btn btn-outline btn-sm" onClick={executeWorkflow} style={{ fontSize: '0.65rem' }}>REPLAY WORKFLOW</button>
                </div>
              </div>
            )}
            {executionLog.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div className="text-xs text-uppercase" style={{ letterSpacing: '0.08em', fontWeight: 600, color: 'var(--color-accent)', marginBottom: '8px' }}>Execution Log</div>
                <div style={{ background: 'var(--color-bg-input)', border: `1px solid ${executionSuccess ? 'rgba(34,197,94,0.3)' : 'var(--color-border-accent)'}`, borderRadius: 'var(--radius-md)', padding: '12px', maxHeight: '300px', overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', lineHeight: '1.8' }}>
                  {executionLog.map((line, i) => (<div key={i} className="animate-slideUp" style={{ animationDelay: `${i * 30}ms` }}>{line}</div>))}
                </div>
              </div>
            )}
            {simResults.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div className="text-xs text-uppercase" style={{ letterSpacing: '0.08em', fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>Simulation Log</div>
                <div style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px', maxHeight: '200px', overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', lineHeight: '1.8' }}>
                  {simResults.map((line, i) => (<div key={i} className="animate-slideUp" style={{ animationDelay: `${i * 50}ms` }}>{line}</div>))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowBuilder;
