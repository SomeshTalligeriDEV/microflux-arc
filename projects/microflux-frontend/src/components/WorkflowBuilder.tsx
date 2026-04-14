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
import 'reactflow/dist/base.css';
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
import { microAlgosToAlgo, normalizeAmountToMicroAlgos } from '../utils/amount';
import {
  callExecute,
  callSetPublicExecution,
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
import {
  executeSwap as executeTinymanSwap,
  getSwapQuote,
  formatAssetAmount,
  TINYMAN_KNOWN_ASSETS,
  type TinymanSwapConfig,
} from '../services/tinymanService';

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

  const meta = useMemo(() => {
    if (data.type === 'send_payment' && data.config.amount)
      return `${(data.config.amount as number) / 1_000_000} ALGO`;
    if (data.type === 'asa_transfer' && data.config.asset_id)
      return `ASA #${data.config.asset_id}`;
    if (data.type === 'tinyman_swap')
      return `${TINYMAN_KNOWN_ASSETS[Number(data.config.fromAssetId)]?.unitName ?? `#${data.config.fromAssetId}`} → ${TINYMAN_KNOWN_ASSETS[Number(data.config.toAssetId)]?.unitName ?? `#${data.config.toAssetId}`}`;
    if (data.type === 'delay' && data.config.duration)
      return `${Number(data.config.duration) / 1000}s`;
    if (data.type === 'get_quote' || data.type === 'price_feed')
      return `${data.config.token ?? 'ALGO'}/${data.config.vs ?? 'USD'}`;
    return null;
  }, [data.type, data.config]);

  return (
    <div
      className={`mfx-node mfx-node--${data.category} ${selected ? 'mfx-node--selected' : ''}`}
      style={{ '--node-color': data.color } as React.CSSProperties}
    >
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="mfx-handle mfx-handle--target"
        />
      )}

      <div className="mfx-node__color-strip" />

      <div className="mfx-node__content">
        <div className="mfx-node__header">
          <div className="mfx-node__icon-badge">
            {data.icon}
          </div>
          <div className="mfx-node__titles">
            <div className="mfx-node__name">{data.label}</div>
            <div className="mfx-node__subtitle">{data.type.replace(/_/g, ' ')}</div>
          </div>
        </div>

        {meta && (
          <div className="mfx-node__meta">
            {meta}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="mfx-handle mfx-handle--source"
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

const toFlowNode = (node: CanvasNodeData, selectedId?: string | null): Node<CanvasNodeData> => ({
  id: node.id,
  type: registeredNodeTypes.has(node.type) ? node.type : 'microfluxNode',
  position: node.position,
  selected: node.id === selectedId,
  data: node,
});

const toFlowEdge = (edge: CanvasEdgeData): Edge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  type: 'smoothstep',
  animated: true,
  style: { stroke: 'rgba(132, 204, 255, 0.5)', strokeWidth: 2.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(132, 204, 255, 0.5)', width: 16, height: 16 },
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
  const [simResults, setSimResults] = useState<string[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [usdQuote, setUsdQuote] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('contract');
  const [contractState, setContractState] = useState<ContractState | null>(null);
  const [executionSuccess, setExecutionSuccess] = useState(false);
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const [useSmartContract, setUseSmartContract] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isEnablingPublic, setIsEnablingPublic] = useState(false);
  const [deployedAppId, setDeployedAppId] = useState<number>(0);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(workflowId ?? null);
  const [isSaving, setIsSaving] = useState(false);
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

  // Sync execution mode from legacy toggle (kept for backward compat)
  useEffect(() => {
    if (useSmartContract && executionMode === 'direct') {
      setExecutionMode('atomic');
    }
  }, [useSmartContract, executionMode]);

  // Derive selectedNode directly for render (instant update)
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const nodeCounter = useRef(0);

  // Load workflow generated inside right-panel AI tab directly into this canvas
  const handleLoadWorkflowFromAi = useCallback((aiNodes: AINode[], aiEdges: AIEdge[]) => {
    const canvasNodes: CanvasNodeData[] = aiNodes.map((n) => {
      const type = n.type === 'filter_condition' ? 'filter' : n.type;
      const def = NODE_DEFINITIONS.find((d) => d.type === type);
      const rawData = (n as any)?.data && typeof (n as any).data === 'object' ? (n as any).data : {};
      return {
        id: n.id,
        type,
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
        const type = n.type === 'filter_condition' ? 'filter' : n.type;
        const def = NODE_DEFINITIONS.find((d) => d.type === type);
        const rawData = (n as any)?.data && typeof (n as any).data === 'object' ? (n as any).data : {};
        return {
          id: n.id,
          type,
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

  const flowNodes = useMemo(() => nodes.map((n) => toFlowNode(n, selectedNodeId)), [nodes, selectedNodeId]);
  const flowEdges = useMemo(() => edges.map(toFlowEdge), [edges]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((currentNodes) => {
      const flowResult = applyNodeChanges(changes, currentNodes.map((n) => toFlowNode(n)));
      return flowResult.map((flowNode) => {
        const existing = currentNodes.find((n) => n.id === flowNode.id);
        if (existing) {
          return { ...existing, position: flowNode.position };
        }
        return flowNode.data as CanvasNodeData;
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

  const handleZoomIn = useCallback(() => {
    flowInstanceRef.current?.zoomIn({ duration: 200 });
  }, []);

  const handleZoomOut = useCallback(() => {
    flowInstanceRef.current?.zoomOut({ duration: 200 });
  }, []);

  const handleResetView = useCallback(() => {
    flowInstanceRef.current?.fitView({ padding: 0.3, duration: 300 });
  }, []);

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
        case 'telegram_command':
          logs.push(`[TELEGRAM] ${node.label}: Command trigger received (${node.config.command ?? '/start'})`);
          break;
        case 'ai_trigger':
          logs.push(`[OK] ${node.label}: LLM Intent evaluated via ${node.config.provider}`);
          break;
        case 'get_quote':
        case 'price_feed': {
          try {
            const quote = await algoToUsd(1);
            logs.push(`[PRICE] ${node.label}: ALGO = ${quote.formatted}`);
          } catch {
            logs.push(`[PRICE] ${node.label}: ALGO = $0.24 (cached — API unavailable)`);
          }
          break;
        }
        case 'app_call':
          logs.push(`[APP] ${node.label}: App call prepared`);
          break;
        case 'http_request':
          logs.push(
            `[HTTP] ${node.label}: ${String((node.config as any).method ?? 'GET')} ${(node.config as any).url || '(no URL)'} — Execute uses server HTTPS proxy`,
          );
          break;
        case 'write_to_spreadsheet':
          logs.push(`[SHEETS] ${node.label}: Writing to spreadsheet (mock)`);
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
          logs.push(
            `[TELEGRAM] ${node.label}: ${String((node.config as any).message || '(no message)')} — Execute sends via bot (link wallet or set chatId)`,
          );
          break;
        case 'discord_notify':
          logs.push(`[DISCORD] ${node.label}: Mock only — use Telegram Notify for real notifications`);
          break;
        case 'tinyman_swap': {
          const fromId = Number(node.config.fromAssetId ?? 0);
          const toId = Number(node.config.toAssetId ?? 0);
          const amt = Number(node.config.amount ?? 0);
          const fromName = TINYMAN_KNOWN_ASSETS[fromId]?.unitName ?? `ASA#${fromId}`;
          const toName = TINYMAN_KNOWN_ASSETS[toId]?.unitName ?? `ASA#${toId}`;
          try {
            const swapConfig: TinymanSwapConfig = {
              fromAssetId: fromId,
              toAssetId: toId,
              amount: amt,
              slippage: Number(node.config.slippage ?? 1),
            };
            const quote = await getSwapQuote(swapConfig);
            logs.push(`[SWAP] ${node.label}: ${formatAssetAmount(amt, fromId)} → ~${formatAssetAmount(quote.expectedAmountOut, toId)}`);
            if (quote.priceImpact > 0) {
              logs.push(`   Price impact: ${(quote.priceImpact * 100).toFixed(2)}%`);
            }
          } catch {
            logs.push(`[SWAP] ${node.label}: Swap ${fromName} → ${toName} (quote unavailable — estimated)`);
          }
          break;
        }
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
    const sharedContext: Record<string, any> = { status: 'unknown', amount: 0, txId: '' };
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';
    const skipSet = new Set<string>();

    for (const node of sortedNodes) {
      if (skipSet.has(node.id)) {
        logs.push(`[SKIP] ${node.label}: Skipped (filter branch)`);
        setExecutionLog([...logs]);
        continue;
      }
      await new Promise((r) => setTimeout(r, 300));

      if (node.type === 'send_payment' && node.isReal) {
        const amount = normalizeAmountToMicroAlgos(
          node.config.amount,
          (node.config as any).amountUnit ?? (node.config as any).unit,
        );
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
          sharedContext.status = 'success';
          const algoAmt = Number(microAlgosToAlgo(amount));
          sharedContext.amount = algoAmt;
          sharedContext.txId = result.txId;
          try {
            const quote = await algoToUsd(algoAmt);
            logs.push(`[OK] ${node.label}: Sent ${algoAmt} ALGO (~${quote.formatted})`);
          } catch {
            logs.push(`[OK] ${node.label}: Sent ${algoAmt} ALGO`);
          }
          logs.push(`   TX: ${result.txId}`);
          logs.push(`   ${getExplorerTxUrl(result.txId, networkName)}`);
        } else {
          sharedContext.status = 'failed';
          sharedContext.txId = '';
          sharedContext.amount = Number(microAlgosToAlgo(amount));
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

      } else if (node.type === 'write_to_spreadsheet') {
        logs.push(`[SHEETS] ${node.label}: Sent /sheets/write ping...`);
        setExecutionLog([...logs]);

        try {
          const res = await fetch(`${apiBase}/sheets/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletAddress: activeAddress,
              algoAmount: sharedContext.amount || 'N/A', 
              txId: sharedContext.txId || 'direct_execution_test',
              status: sharedContext.status
            })
          });
          if (res.ok) {
            logs.push(`[OK] ${node.label}: Spreadsheet updated`);
          } else {
            const errText = await res.text();
            logs.push(`[FAIL] ${node.label}: ${errText || 'Server error'}`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Cannot reach server';
          logs.push(`[FAIL] ${node.label}: ${msg}`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'telegram_notify') {
        const message = String((node.config as any).message ?? '').trim();
        const chatIdRaw = (node.config as any).chatId;
        const chatId =
          chatIdRaw !== undefined && chatIdRaw !== null && String(chatIdRaw).trim() !== ''
            ? String(chatIdRaw).trim()
            : undefined;

        if (!message) {
          logs.push(`[SKIP] ${node.label}: Set message text`);
          setExecutionLog([...logs]);
          continue;
        }

        logs.push(`[TELEGRAM] ${node.label}: Sending via bot...`);
        setExecutionLog([...logs]);
        try {
          const body: Record<string, string> = { message };
          if (chatId) body.chatId = chatId;
          else body.walletAddress = activeAddress;

          const res = await fetch(`${apiBase}/notify/telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (res.ok) {
            logs.push(`[OK] ${node.label}: Telegram message sent`);
          } else {
            let detail = '';
            let hint = '';
            try {
              const j = await res.json() as { error?: string; hint?: string };
              detail = j.error || JSON.stringify(j);
              hint = j.hint || '';
            } catch {
              detail = await res.text();
            }
            logs.push(`[FAIL] ${node.label}: ${detail || res.statusText}`);
            if (hint) logs.push(`   ${hint}`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Cannot reach server';
          logs.push(`[FAIL] ${node.label}: ${msg}`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'http_request') {
        const url = String((node.config as any).url ?? '').trim();
        const method = String((node.config as any).method ?? 'GET').toUpperCase();
        if (!url) {
          logs.push(`[SKIP] ${node.label}: No URL configured`);
          setExecutionLog([...logs]);
          continue;
        }
        logs.push(`[HTTP] ${node.label}: ${method} via server proxy...`);
        setExecutionLog([...logs]);
        try {
          const res = await fetch(`${apiBase}/proxy/http`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url,
              method,
              headers: (node.config as any).headers ?? {},
              body: (node.config as any).body,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data && typeof data === 'object' && 'ok' in data) {
            const d = data as { ok?: boolean; status?: number; data?: unknown };
            const tag = d.ok ? '[OK]' : '[FAIL]';
            logs.push(`${tag} ${node.label}: HTTP ${d.status ?? '?'}`);
            const preview =
              typeof d.data === 'string'
                ? d.data.slice(0, 200)
                : JSON.stringify(d.data ?? '').slice(0, 200);
            if (preview) logs.push(`   Response: ${preview}${preview.length >= 200 ? '…' : ''}`);
          } else {
            logs.push(`[FAIL] ${node.label}: ${(data as { error?: string }).error || res.statusText}`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Cannot reach server';
          logs.push(`[FAIL] ${node.label}: ${msg}`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'filter' || node.type === 'filter_condition') {
        const fieldName = String(node.config.field || 'payment_status');
        const condition = String(node.config.condition || '==');
        // Do not use || here: value 0 is valid for numeric filters (0 || 'success' was wrong).
        const rawExpected = node.config.value;
        const expectedValue =
          rawExpected === undefined || rawExpected === null ? 'success' : String(rawExpected);

        logs.push(`[LOGIC] ${node.label}: Evaluating if ${fieldName} ${condition} "${expectedValue}"...`);
        setExecutionLog([...logs]);

        const actualValue = sharedContext[fieldName === 'payment_status' ? 'status' : fieldName];
        const actual = String(actualValue ?? '');
        const expected = String(expectedValue);
        const numActual = Number(actualValue);
        const numExpected = Number(expectedValue);
        
        let isTrue = false;
        switch (condition) {
          case '==': case 'eq':   isTrue = (actual === expected); break;
          case '!=': case 'neq':  isTrue = (actual !== expected); break;
          case '>':  case 'gt':   isTrue = (numActual > numExpected); break;
          case '>=': case 'gte':  isTrue = (numActual >= numExpected); break;
          case '<':  case 'lt':   isTrue = (numActual < numExpected); break;
          case '<=': case 'lte':  isTrue = (numActual <= numExpected); break;
          default:
            logs.push(`[LOGIC] Unknown operator "${condition}", treating as false`);
        }

        if (!isTrue) {
          logs.push(`[LOGIC] Condition false — skipping downstream nodes on this branch`);
          const downstream = new Set<string>();
          const collectDownstream = (sourceId: string) => {
            for (const e of edges) {
              if (e.source === sourceId && !downstream.has(e.target)) {
                downstream.add(e.target);
                collectDownstream(e.target);
              }
            }
          };
          collectDownstream(node.id);
          for (const id of downstream) skipSet.add(id);
          setExecutionLog([...logs]);
        } else {
          logs.push(`[LOGIC] Condition true — proceeding down primary path`);
          setExecutionLog([...logs]);
        }

      } else if (node.type === 'browser_notification') {
        if (Notification.permission === 'granted') {
          new Notification(node.config.title as string, { body: node.config.body as string });
          logs.push(`[NOTIFY] ${node.label}: Notification sent`);
        } else if (Notification.permission !== 'denied') {
          await Notification.requestPermission();
          logs.push(`[NOTIFY] ${node.label}: Permission requested`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'tinyman_swap' && node.isReal) {
        const fromId = Number(node.config.fromAssetId ?? 0);
        const toId = Number(node.config.toAssetId ?? 0);
        const amt = Number(node.config.amount ?? 0);
        const slip = Number(node.config.slippage ?? 1);
        const fromName = TINYMAN_KNOWN_ASSETS[fromId]?.unitName ?? `ASA#${fromId}`;
        const toName = TINYMAN_KNOWN_ASSETS[toId]?.unitName ?? `ASA#${toId}`;

        logs.push(`[SWAP] ${node.label}: Swapping ${formatAssetAmount(amt, fromId)} → ${toName} via Tinyman V2...`);
        setExecutionLog([...logs]);

        try {
          const swapResult = await executeTinymanSwap(
            activeAddress,
            { fromAssetId: fromId, toAssetId: toId, amount: amt, slippage: slip },
            transactionSigner as any,
          );

          if (swapResult.success) {
            sharedContext.swap_status = 'success';
            sharedContext.status = 'success';
            sharedContext.swap_txId = swapResult.txId ?? '';
            logs.push(`[OK] ${node.label}: Swap confirmed`);
            if (swapResult.quote) {
              logs.push(`   Output: ~${formatAssetAmount(swapResult.quote.expectedAmountOut, toId)}`);
            }
            if (swapResult.txId) {
              logs.push(`   TX: ${swapResult.txId}`);
              logs.push(`   ${getExplorerTxUrl(swapResult.txId, networkName)}`);
            }
          } else {
            sharedContext.swap_status = 'failed';
            sharedContext.status = 'failed';
            logs.push(`[FAIL] ${node.label}: ${swapResult.error}`);
          }
        } catch (swapErr) {
          sharedContext.swap_status = 'failed';
          sharedContext.status = 'failed';
          const msg = swapErr instanceof Error ? swapErr.message : 'Tinyman swap failed';
          logs.push(`[WARN] ${node.label}: Swap unavailable — ${msg}`);
          logs.push(`   Workflow continues (swap node skipped)`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'get_quote' || node.type === 'price_feed') {
        try {
          const quote = await algoToUsd(1);
          sharedContext.price = quote.usd;
          logs.push(`[PRICE] ${node.label}: ALGO = ${quote.formatted}`);
        } catch {
          sharedContext.price = 0.24;
          logs.push(`[PRICE] ${node.label}: ALGO = $0.24 (cached — API unavailable)`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'delay') {
        const duration = Math.min(Number(node.config.duration ?? 5000), 30000);
        logs.push(`[WAIT] ${node.label}: Waiting ${duration / 1000}s...`);
        setExecutionLog([...logs]);
        await new Promise((r) => setTimeout(r, duration));
        logs.push(`[OK] ${node.label}: Delay complete`);
        setExecutionLog([...logs]);

      } else {
        const triggerTypes = new Set([
          'wallet_event',
          'webhook_trigger',
          'timer_loop',
          'telegram_command',
          'ai_trigger',
        ]);
        if (triggerTypes.has(node.type)) {
          logs.push(`[OK] ${node.label}: Trigger (no separate tx — downstream steps are on-chain when executed)`);
        } else {
          logs.push(`[SKIP] ${node.label}: Not executed in this mode (${node.isReal ? 'configure execution mode' : 'placeholder'})`);
        }
        setExecutionLog([...logs]);
      }
    }
  }, [nodes, edges, activeAddress, transactionSigner, networkName]);

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
      logs.push('[FAIL] Contract call failed:');
      for (const line of (result.error || '').split('\n')) {
        if (line.trim()) logs.push(`   ${line}`);
      }
    }
    setExecutionLog([...logs]);
  }, [nodes, activeAddress, transactionSigner, networkName]);

  // MODE C: Atomic transaction group (payments + ASA + app call combined)
  const executeAtomic = useCallback(async (logs: string[]) => {
    if (!activeAddress || !transactionSigner) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

    const payments: Array<{ receiver: string; amountMicroAlgos: number }> = [];
    const asaTransfers: Array<{ receiver: string; assetId: number; amount: number }> = [];
    const sortedNodes = getExecutionOrder();

    for (const node of sortedNodes) {
      if (node.type === 'send_payment' && node.isReal) {
        const receiver = String(node.config.receiver || '');
        const amount = normalizeAmountToMicroAlgos(
          node.config.amount,
          (node.config as any).amountUnit ?? (node.config as any).unit,
        );
        if (!receiver || receiver === 'ALGO_ADDRESS_PLACEHOLDER' || amount <= 0) continue;
        try { algosdk.decodeAddress(receiver); } catch {
          logs.push(`[SKIP] ${node.label}: Invalid receiver address — excluded from group`);
          setExecutionLog([...logs]);
          continue;
        }
        payments.push({ receiver, amountMicroAlgos: amount });
      } else if (node.type === 'asa_transfer' && node.isReal) {
        const receiver = String(node.config.receiver || '');
        const assetId = Number(node.config.asset_id) || 0;
        const amount = Number(node.config.amount) || 0;
        if (!receiver || !assetId || !amount) continue;
        try { algosdk.decodeAddress(receiver); } catch {
          logs.push(`[SKIP] ${node.label}: Invalid receiver address — excluded from group`);
          setExecutionLog([...logs]);
          continue;
        }
        asaTransfers.push({ receiver, assetId, amount });
      }
    }

    // Generate workflow hash for contract
    const workflowData = { nodes: nodes.map(n => ({ type: n.type, config: n.config })), timestamp: Date.now() };
    const wfHash = await hashWorkflow(workflowData);
    const hasAppCallNode = nodes.some((n) => n.type === 'app_call' && n.isReal);
    const appId = hasAppCallNode ? getAppId() : 0;

    if (hasAppCallNode && !appId) {
      logs.push('[FAIL] app_call node exists but no App ID is configured. Set VITE_APP_ID in frontend .env.');
      setExecutionLog([...logs]);
      return;
    }

    const txnCount = payments.length + asaTransfers.length + (hasAppCallNode ? 1 : 0);
    logs.push(`Building atomic group: ${txnCount} transactions`);
    if (payments.length) logs.push(`   ${payments.length} payment(s)`);
    if (asaTransfers.length) logs.push(`   ${asaTransfers.length} ASA transfer(s)`);
    if (hasAppCallNode) logs.push(`   1 app call (App ${appId})`);
    logs.push(`Requesting wallet signature for entire group...`);
    setExecutionLog([...logs]);

    const result = await executeAtomicGroup(
      activeAddress,
      {
        payments: payments.length > 0 ? payments : undefined,
        asaTransfers: asaTransfers.length > 0 ? asaTransfers : undefined,
        appCall: hasAppCallNode ? { workflowHash: wfHash, appId } : undefined,
      },
      transactionSigner as any,
    );

    if (result.success) {
      logs.push(`[OK] Atomic group confirmed.`);
      logs.push(`   TX: ${result.txId}`);
      logs.push(`   ${getExplorerTxUrl(result.txId, networkName)}`);
      if (hasAppCallNode) logs.push(`   ${getAppExplorerUrl(appId, networkName)}`);

      // Post-execution: check if the graph wanted to write to spreadsheet!
      const hasSpreadsheetNode = nodes.some((n) => n.type === 'write_to_spreadsheet');
      if (hasSpreadsheetNode) {
        logs.push(`[SHEETS] Writing successful atomic transaction to spreadsheet...`);
        setExecutionLog([...logs]);
        try {
          const res = await fetch(`${apiBase}/sheets/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletAddress: activeAddress,
              algoAmount: payments.reduce((acc, p) => acc + p.amountMicroAlgos / 1000000, 0),
              txId: result.txId,
              status: 'Success'
            })
          });
          if (res.ok) {
            logs.push(`[OK] Spreadsheet updated`);
          } else {
            const errText = await res.text();
            logs.push(`[FAIL] Spreadsheet write failed: ${errText || 'Server error'}`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Cannot reach spreadsheet server';
          logs.push(`[FAIL] ${msg}`);
        }
      }
      
      logs.push('');
      logs.push(`All ${txnCount} transactions executed atomically`);
    } else {
      logs.push(`[FAIL] Atomic execution failed: ${result.error}`);
    }
    setExecutionLog([...logs]);
  }, [nodes, edges, activeAddress, transactionSigner, networkName, getExecutionOrder]);

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
    if (executionMode === 'contract') {
      logs.push(`Mode: CONTRACT — wallet L1 txs + off-chain notifications, then WorkflowExecutor execute() for on-chain record`);
      logs.push(`   (Telegram / HTTP / sheets stay off-chain; payments & swaps are signed on-chain first)`);
    } else {
      logs.push(`Mode: ${modeLabel} • ${onChainCount} on-chain-capable nodes`);
    }
  logs.push('');
    setExecutionLog([...logs]);

    try {
      switch (executionMode) {
        case 'direct':
          await executeDirect(logs);
          break;
        case 'contract':
          await executeDirect(logs);
          logs.push('');
          logs.push('───────── WorkflowExecutor — on-chain execution record ─────────');
          setExecutionLog([...logs]);
          await executeViaContract(logs);
          break;
        case 'atomic':
          await executeAtomic(logs);
          break;
      }

      // Success: Direct/Atomic = any [OK]. Contract = WorkflowExecutor must confirm (on-chain record).
      const anyOk = logs.some((l) => l.includes('[OK]'));
      const contractConfirmed = logs.some((l) => l.includes('Contract execution confirmed'));
      const contractFailed =
        executionMode === 'contract' &&
        logs.some((l) => l.includes('Contract call failed') || l.includes('Contract call failed:'));
      const hasSuccess =
        executionMode === 'contract' ? contractConfirmed : anyOk;

      if (executionMode === 'contract' && anyOk && contractFailed) {
        logs.push('');
        logs.push(
          '[WARN] Some steps succeeded, but WorkflowExecutor execute() failed — L1 txs may still have gone through. Fix creator-only mode (enable public execution) or check App ID.',
        );
      }

      const txLine = logs.find((l) => l.trim().startsWith('TX:'));
      if (hasSuccess) {
        setExecutionSuccess(true);
        if (txLine) setLastTxId(txLine.replace(/.*TX:\s*/, '').trim());
      }

      logs.push('');
      if (hasSuccess) {
        logs.push('═══════════════════════════════');
        logs.push('EXECUTION SUCCESSFUL');
        if (executionMode === 'contract') {
          logs.push('L1 transactions (if any) and WorkflowExecutor record confirmed on Algorand Testnet.');
        } else {
          logs.push('All transactions confirmed on Algorand Testnet.');
          logs.push('No data is mocked. Every action was signed');
          logs.push('by your wallet and confirmed on-chain.');
        }
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

  const enablePublicExecutionHandler = useCallback(async () => {
    if (!activeAddress || !transactionSigner) return;
    const appId = getAppId() || deployedAppId;
    if (!appId) return;
    setIsEnablingPublic(true);
    try {
      const result = await callSetPublicExecution(
        activeAddress,
        true,
        transactionSigner as any,
        appId,
      );
      if (result.success) {
        const state = await getContractState(appId);
        if (state) setContractState(state);
        alert('Public execution enabled. Any wallet can now record executions on-chain via execute().');
      } else {
        alert(`Failed: ${result.error}`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unknown error');
    }
    setIsEnablingPublic(false);
  }, [activeAddress, transactionSigner, deployedAppId]);

  return (
    <div className="workspace-layout">
      {/* ── Left Sidebar: Node Palette ────── */}
      <div className="sidebar" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="text-sm font-bold text-uppercase" style={{ letterSpacing: '0.06em' }}>
            {workflowName || 'NODE PALETTE'}
          </div>
          <div className="text-xs text-muted" style={{ marginTop: '2px' }}>
            Drag or click to add blocks
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
          className="mfx-canvas"
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
          connectOnClick
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={{ stroke: 'rgba(132, 204, 255, 0.5)', strokeWidth: 2.5 }}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode={null}
          minZoom={0.1}
          maxZoom={4}
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          panOnDrag
          panOnScroll={false}
          selectionOnDrag={false}
          selectNodesOnDrag={false}
          preventScrolling
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
            style: { stroke: 'rgba(132, 204, 255, 0.5)', strokeWidth: 2.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(132, 204, 255, 0.5)', width: 16, height: 16 },
          }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable
          elementsSelectable
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.2}
            color="rgba(255, 255, 255, 0.07)"
          />
          <Controls
            showInteractive={false}
            position="bottom-left"
          />
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={2}
            nodeColor={(node) => node.data?.color ?? '#666'}
            maskColor="rgba(6, 8, 12, 0.72)"
          />
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="mfx-empty-canvas">
            <div className="mfx-empty-canvas__icon">⬡</div>
            <div className="mfx-empty-canvas__title">Empty Canvas</div>
            <div className="mfx-empty-canvas__desc">
              Drag nodes from the palette or use AI to generate a workflow
            </div>
          </div>
        )}

        <div className="mfx-zoom-toolbar">
          <button type="button" title="Zoom In" onClick={handleZoomIn}>+</button>
          <button type="button" title="Zoom Out" onClick={handleZoomOut}>−</button>
          <button type="button" title="Fit View" onClick={handleResetView}>⊞</button>
        </div>

        {paletteDragPreview && (
          <div
            className={`mfx-node mfx-node--${paletteDragPreview.def.category}`}
            style={{
              position: 'fixed',
              left: paletteDragPreview.clientX - 100,
              top: paletteDragPreview.clientY - 24,
              opacity: 0.72,
              pointerEvents: 'none',
              zIndex: 999,
              ['--node-color' as string]: paletteDragPreview.def.color,
            }}
          >
            <div className="mfx-node__color-strip" />
            <div className="mfx-node__content">
              <div className="mfx-node__header">
                <div className="mfx-node__icon-badge">{paletteDragPreview.def.icon}</div>
                <div className="mfx-node__titles">
                  <div className="mfx-node__name">{paletteDragPreview.def.label}</div>
                  <div className="mfx-node__subtitle">{paletteDragPreview.def.type.replace(/_/g, ' ')}</div>
                </div>
              </div>
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
                {selectedNode.type === 'ai_trigger' && (
                  <>
                    <div style={{ marginBottom: '12px' }}>
                      <label className="text-xs" style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        AI Provider
                      </label>
                      <select
                        className="input"
                        value={String(selectedNode.config.provider || 'Groq')}
                        onChange={(e) => {
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === selectedNode.id
                                ? { ...n, config: { ...n.config, provider: e.target.value } }
                                : n
                            )
                          );
                        }}
                      >
                        <option value="Groq">Groq</option>
                        <option value="Gemini">Gemini</option>
                        <option value="OpenAI">OpenAI</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label className="text-xs" style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        API Key (Local only)
                      </label>
                      <input
                        className="input"
                        type="password"
                        placeholder="sk-..."
                        value={String(selectedNode.config.apiKey || '')}
                        onChange={(e) => {
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === selectedNode.id
                                ? { ...n, config: { ...n.config, apiKey: e.target.value } }
                                : n
                            )
                          );
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label className="text-xs" style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        Intent Prompt Trigger
                      </label>
                      <textarea
                        className="input"
                        placeholder="Condition to trigger upon..."
                        rows={3}
                        value={String(selectedNode.config.prompt || '')}
                        onChange={(e) => {
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === selectedNode.id
                                ? { ...n, config: { ...n.config, prompt: e.target.value } }
                                : n
                            )
                          );
                        }}
                      />
                    </div>
                  </>
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
                {selectedNode.type === 'tinyman_swap' && (
                  <>
                    <div style={{ marginBottom: '12px' }}>
                      <label className="text-xs" style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        From Asset ID (0 = ALGO)
                      </label>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={String(selectedNode.config.fromAssetId ?? 0)}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : Number(e.target.value);
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === selectedNode.id
                                ? { ...n, config: { ...n.config, fromAssetId: val } }
                                : n
                            )
                          );
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label className="text-xs" style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        To Asset ID (e.g. 31566704 = USDC)
                      </label>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        placeholder="31566704"
                        value={String(selectedNode.config.toAssetId ?? 0)}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : Number(e.target.value);
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === selectedNode.id
                                ? { ...n, config: { ...n.config, toAssetId: val } }
                                : n
                            )
                          );
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label className="text-xs" style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        Slippage Tolerance (%)
                      </label>
                      <input
                        className="input"
                        type="number"
                        min="0.1"
                        max="50"
                        step="0.1"
                        placeholder="1"
                        value={String(selectedNode.config.slippage ?? 1)}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 1 : Number(e.target.value);
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === selectedNode.id
                                ? { ...n, config: { ...n.config, slippage: val } }
                                : n
                            )
                          );
                        }}
                      />
                    </div>
                  </>
                )}
                {Object.entries(selectedNode.config)
                  .filter(([key]) => !['receiver', 'amount', 'asset_id', 'app_id', 'method', 'args', 'fromAssetId', 'toAssetId', 'slippage'].includes(key))
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
                <div className="sim-row"><span className="sim-label">Execution Type</span><span className="sim-value" style={{ fontWeight: 700, color: 'var(--color-info)', textTransform: 'uppercase' }}>{executionMode}</span></div>
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
            <div style={{ padding: '8px 12px', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: '10px' }}>
              <div className="text-xs" style={{ fontWeight: 600, marginBottom: '6px' }}>Execution Mode</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['direct', 'atomic', 'contract'] as ExecutionMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`btn btn-sm ${executionMode === mode ? 'btn-accent' : 'btn-ghost'}`}
                    style={{ flex: 1, fontSize: '0.6rem', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                    onClick={() => {
                      setExecutionMode(mode);
                      setUseSmartContract(mode !== 'direct');
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="text-xs text-muted" style={{ fontSize: '0.55rem', marginTop: '4px' }}>
                {executionMode === 'direct' &&
                  'Payments & swaps: real on-chain L1 txs, signed one-by-one. Best for Telegram + payments.'}
                {executionMode === 'atomic' &&
                  'Atomic group — all-or-nothing; L1 txs + optional app call in one batch.'}
                {executionMode === 'contract' &&
                  'Runs payments/swaps as real L1 txs, sends Telegram/API off-chain, then calls WorkflowExecutor execute() so the run shows on-chain.'}
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
                <span className="sim-label">Public execute</span>
                <span className="sim-value" style={{ fontWeight: 600, color: contractState?.publicExecution ? 'var(--color-success)' : 'var(--color-warning)' }}>
                  {contractState ? (contractState.publicExecution ? 'On' : 'Off (creator only)') : '—'}
                </span>
              </div>
              {contractState?.creator && (
                <div className="sim-row">
                  <span className="sim-label">Creator</span>
                  <span className="sim-value" style={{ fontSize: '0.6rem' }} title={contractState.creator}>
                    {contractState.creator.slice(0, 6)}…{contractState.creator.slice(-4)}
                  </span>
                </div>
              )}
              {(getAppId() > 0 || deployedAppId > 0) &&
                contractState &&
                !contractState.publicExecution &&
                activeAddress &&
                contractState.creator === activeAddress && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm w-full"
                    onClick={enablePublicExecutionHandler}
                    disabled={isEnablingPublic}
                    style={{ marginTop: '6px', marginBottom: '4px', fontSize: '0.6rem' }}
                  >
                    {isEnablingPublic ? 'ENABLING…' : 'ENABLE PUBLIC EXECUTION'}
                  </button>
                )}
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
