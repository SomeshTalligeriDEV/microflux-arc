import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  type ContractState,
} from '../services/contractService';
import type { AINode, AIEdge } from '../services/aiService';

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

interface WorkflowBuilderProps {
  initialNodes?: AINode[];
  initialEdges?: AIEdge[];
  workflowName?: string;
  activeAddress: string | null;
  transactionSigner?: (txnGroup: unknown[], indexesToSign: number[]) => Promise<Uint8Array[]>;
  networkName?: string;
  onBalanceUpdate?: (balance: number) => void;
}

// ── WorkflowBuilder ──────────────────────────

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  initialNodes,
  initialEdges,
  workflowName,
  activeAddress,
  transactionSigner,
  networkName = 'localnet',
  onBalanceUpdate,
}) => {
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
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('direct');
  const [contractState, setContractState] = useState<ContractState | null>(null);

  // Load contract state on mount
  useEffect(() => {
    const appId = getAppId();
    if (appId > 0) {
      getContractState(appId).then(setContractState).catch(() => setContractState(null));
    }
  }, []);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeCounter = useRef(0);

  // Load initial nodes from AI or templates
  useEffect(() => {
    if (initialNodes && initialNodes.length > 0) {
      const canvasNodes: CanvasNodeData[] = initialNodes.map((n) => {
        const def = NODE_DEFINITIONS.find((d) => d.type === n.type);
        return {
          id: n.id,
          type: n.type,
          label: n.label,
          category: n.category as NodeCategory,
          config: n.config,
          position: n.position,
          icon: def?.icon ?? '📦',
          color: def?.color ?? '#666',
          isReal: def?.isReal ?? false,
        };
      });
      setNodes(canvasNodes);
      setEdges(initialEdges?.map((e) => ({ id: e.id, source: e.source, target: e.target })) ?? []);
      nodeCounter.current = canvasNodes.length;
    }
  }, [initialNodes, initialEdges]);

  // Add node from palette
  const addNode = useCallback((def: NodeDefinition) => {
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
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [selectedNodeId]);

  // Mouse handlers for node dragging
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDraggingNodeId(nodeId);
    setDragOffset({
      x: e.clientX - rect.left - node.position.x,
      y: e.clientY - rect.top - node.position.y,
    });
    setSelectedNodeId(nodeId);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!draggingNodeId) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const newX = e.clientX - rect.left - dragOffset.x;
    const newY = e.clientY - rect.top - dragOffset.y;

    setNodes((prev) =>
      prev.map((n) =>
        n.id === draggingNodeId ? { ...n, position: { x: Math.max(0, newX), y: Math.max(0, newY) } } : n
      )
    );
  };

  const handleCanvasMouseUp = () => {
    setDraggingNodeId(null);
  };

  // Port connection handlers
  const handlePortClick = (nodeId: string, isOutput: boolean) => {
    if (isOutput) {
      setConnectingFrom(nodeId);
    } else if (connectingFrom && connectingFrom !== nodeId) {
      // Check for duplicate edges
      const exists = edges.some((e) => e.source === connectingFrom && e.target === nodeId);
      if (!exists) {
        const edgeId = `edge_${Date.now()}`;
        setEdges((prev) => [...prev, { id: edgeId, source: connectingFrom, target: nodeId }]);
      }
      setConnectingFrom(null);
    }
  };

  // Simulate workflow
  const simulateWorkflow = useCallback(async () => {
    setIsSimulating(true);
    setSimResults([]);

    const logs: string[] = [];
    const sortedNodes = [...nodes]; // Simple execution order

    for (const node of sortedNodes) {
      await new Promise((r) => setTimeout(r, 400));

      switch (node.type) {
        case 'send_payment': {
          const amt = (node.config.amount as number) / 1000000;
          try {
            const quote = await algoToUsd(amt);
            logs.push(`✅ ${node.label}: Send ${amt} ALGO (~${quote.formatted})`);
            setUsdQuote(`${amt} ALGO ≈ ${quote.formatted}`);
          } catch {
            logs.push(`✅ ${node.label}: Send ${amt} ALGO`);
          }
          break;
        }
        case 'asa_transfer':
          logs.push(`✅ ${node.label}: Transfer ASA #${node.config.asset_id}`);
          break;
        case 'filter':
          logs.push(`🔀 ${node.label}: Condition evaluated → true`);
          break;
        case 'delay':
          logs.push(`⏳ ${node.label}: Waiting ${(node.config.duration as number) / 1000}s...`);
          break;
        case 'debug_log':
          logs.push(`🐛 ${node.label}: ${node.config.message}`);
          break;
        case 'timer_loop':
          logs.push(`⏱ ${node.label}: Timer triggered`);
          break;
        case 'wallet_event':
          logs.push(`👛 ${node.label}: Wallet event received`);
          break;
        case 'webhook_trigger':
          logs.push(`🔗 ${node.label}: Webhook received`);
          break;
        case 'get_quote':
        case 'price_feed':
          logs.push(`💹 ${node.label}: ALGO = $0.24 (cached)`);
          break;
        case 'app_call':
          logs.push(`📝 ${node.label}: App call prepared`);
          break;
        case 'http_request':
          logs.push(`🌐 ${node.label}: HTTP request (mock)`);
          break;
        case 'browser_notification':
          logs.push(`🔔 ${node.label}: Notification sent`);
          if (Notification.permission === 'granted') {
            new Notification(node.config.title as string, { body: node.config.body as string });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
          }
          break;
        case 'telegram_notify':
          logs.push(`✈️ ${node.label}: Telegram (mock)`);
          break;
        case 'discord_notify':
          logs.push(`🎮 ${node.label}: Discord (mock)`);
          break;
        default:
          logs.push(`📦 ${node.label}: Processed`);
      }

      setSimResults([...logs]);
    }

    logs.push('');
    logs.push('───── SIMULATION COMPLETE ─────');
    setSimResults([...logs]);
    setIsSimulating(false);
  }, [nodes]);

  // ── HYBRID EXECUTION ENGINE ─────────────────

  // MODE A: Direct L1 transactions (individual signing)
  const executeDirect = useCallback(async (logs: string[]) => {
    if (!activeAddress || !transactionSigner) return;

    for (const node of nodes) {
      await new Promise((r) => setTimeout(r, 300));

      if (node.type === 'send_payment' && node.isReal) {
        const amount = Number(node.config.amount) || 0;
        const receiver = String(node.config.receiver || '');

        if (!receiver || receiver === 'ALGO_ADDRESS_PLACEHOLDER') {
          logs.push(`⚠️ ${node.label}: Skipped — no receiver set`);
          setExecutionLog([...logs]);
          continue;
        }

        logs.push(`🔄 ${node.label}: Requesting wallet signature...`);
        setExecutionLog([...logs]);

        const result = await sendPayment(
          activeAddress,
          receiver,
          amount,
          transactionSigner as (txnGroup: unknown[], indexesToSign: number[]) => Promise<Uint8Array[]>,
        );

        if (result.success) {
          const algoAmt = amount / 1_000_000;
          try {
            const quote = await algoToUsd(algoAmt);
            logs.push(`✅ ${node.label}: Sent ${algoAmt} ALGO (~${quote.formatted})`);
          } catch {
            logs.push(`✅ ${node.label}: Sent ${algoAmt} ALGO`);
          }
          logs.push(`   TX: ${result.txId}`);
          logs.push(`   🔗 ${getExplorerTxUrl(result.txId, networkName)}`);
        } else {
          logs.push(`❌ ${node.label}: ${result.error}`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'asa_transfer' && node.isReal) {
        const assetId = Number(node.config.asset_id) || 0;
        const amount = Number(node.config.amount) || 0;
        const receiver = String(node.config.receiver || '');

        if (!receiver || !assetId) {
          logs.push(`⚠️ ${node.label}: Skipped — missing config`);
          setExecutionLog([...logs]);
          continue;
        }

        logs.push(`🔄 ${node.label}: Requesting wallet signature...`);
        setExecutionLog([...logs]);

        const result = await sendAsaTransfer(
          activeAddress,
          receiver,
          assetId,
          amount,
          transactionSigner as (txnGroup: unknown[], indexesToSign: number[]) => Promise<Uint8Array[]>,
        );

        if (result.success) {
          logs.push(`✅ ${node.label}: Transferred ${amount} of ASA #${assetId}`);
          logs.push(`   TX: ${result.txId}`);
        } else {
          logs.push(`❌ ${node.label}: ${result.error}`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'app_call' && node.isReal) {
        const appId = Number(node.config.app_id) || 0;
        const method = String(node.config.method || '');
        const args = Array.isArray(node.config.args) ? node.config.args.map(String) : [];

        if (!appId || !method) {
          logs.push(`⚠️ ${node.label}: Skipped — missing app_id or method`);
          setExecutionLog([...logs]);
          continue;
        }

        logs.push(`🔄 ${node.label}: Calling App ${appId} → ${method}...`);
        setExecutionLog([...logs]);

        const result = await genericAppCall(
          activeAddress,
          appId,
          method,
          args,
          transactionSigner as (txnGroup: unknown[], indexesToSign: number[]) => Promise<Uint8Array[]>,
        );

        if (result.success) {
          logs.push(`✅ ${node.label}: App call confirmed`);
          logs.push(`   TX: ${result.txId}`);
          logs.push(`   📱 App: ${getAppExplorerUrl(appId, networkName)}`);
        } else {
          logs.push(`❌ ${node.label}: ${result.error}`);
        }
        setExecutionLog([...logs]);

      } else if (node.type === 'browser_notification' && node.isReal) {
        if (Notification.permission === 'granted') {
          new Notification(node.config.title as string, { body: node.config.body as string });
          logs.push(`🔔 ${node.label}: Notification sent`);
        } else if (Notification.permission !== 'denied') {
          await Notification.requestPermission();
          logs.push(`🔔 ${node.label}: Permission requested`);
        }
        setExecutionLog([...logs]);

      } else {
        logs.push(`⏭ ${node.label}: Simulated (${node.isReal ? 'on-chain' : 'mock'})`);
        setExecutionLog([...logs]);
      }
    }
  }, [nodes, activeAddress, transactionSigner, networkName]);

  // MODE B: Execute via WorkflowExecutor smart contract
  const executeViaContract = useCallback(async (logs: string[]) => {
    if (!activeAddress || !transactionSigner) return;

    const appId = getAppId();
    if (!appId) {
      logs.push('❌ No App ID configured. Deploy contract first.');
      logs.push('   Set VITE_APP_ID=<app_id> in .env');
      setExecutionLog([...logs]);
      return;
    }

    // Hash the workflow for on-chain verification
    const workflowData = { nodes: nodes.map(n => ({ type: n.type, config: n.config })), timestamp: Date.now() };
    const wfHash = await hashWorkflow(workflowData);

    logs.push(`📋 Workflow hash: ${wfHash.slice(0, 24)}...`);
    logs.push(`📱 App ID: ${appId}`);
    logs.push(`🔄 Calling execute() on WorkflowExecutor...`);
    setExecutionLog([...logs]);

    const result = await callExecute(
      activeAddress,
      wfHash,
      transactionSigner as (txnGroup: unknown[], indexesToSign: number[]) => Promise<Uint8Array[]>,
      appId,
    );

    if (result.success) {
      logs.push(`✅ Contract execution confirmed!`);
      logs.push(`   TX: ${result.txId}`);
      logs.push(`   🔗 ${getExplorerTxUrl(result.txId, networkName)}`);
      logs.push(`   📱 ${getAppExplorerUrl(appId, networkName)}`);
      logs.push('');
      logs.push('🔒 This execution is now verifiable on-chain');

      // Refresh contract state
      const newState = await getContractState(appId);
      if (newState) {
        setContractState(newState);
        logs.push(`   Execution #${newState.totalExecutions}`);
      }
    } else {
      logs.push(`❌ Contract call failed: ${result.error}`);
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
    logs.push(`📦 Building atomic group: ${txnCount} transactions`);
    if (payments.length) logs.push(`   💰 ${payments.length} payment(s)`);
    if (asaTransfers.length) logs.push(`   🪙 ${asaTransfers.length} ASA transfer(s)`);
    if (appId) logs.push(`   📱 1 app call (App ${appId})`);
    logs.push(`🔄 Requesting wallet signature for entire group...`);
    setExecutionLog([...logs]);

    const result = await executeAtomicGroup(
      activeAddress,
      {
        payments: payments.length > 0 ? payments : undefined,
        asaTransfers: asaTransfers.length > 0 ? asaTransfers : undefined,
        appCall: appId ? { workflowHash: wfHash, appId } : undefined,
      },
      transactionSigner as (txnGroup: unknown[], indexesToSign: number[]) => Promise<Uint8Array[]>,
    );

    if (result.success) {
      logs.push(`✅ Atomic group confirmed!`);
      logs.push(`   TX: ${result.txId}`);
      logs.push(`   🔗 ${getExplorerTxUrl(result.txId, networkName)}`);
      if (appId) logs.push(`   📱 ${getAppExplorerUrl(appId, networkName)}`);
      logs.push('');
      logs.push(`🔒 All ${txnCount} transactions executed atomically`);
    } else {
      logs.push(`❌ Atomic execution failed: ${result.error}`);
    }
    setExecutionLog([...logs]);
  }, [nodes, activeAddress, transactionSigner, networkName]);

  // Master execution handler
  const executeWorkflow = useCallback(async () => {
    if (!activeAddress || !transactionSigner) return;

    setIsExecuting(true);
    setExecutionLog([]);
    const logs: string[] = [];

    const modeLabel = executionMode === 'direct' ? 'DIRECT' : executionMode === 'contract' ? 'CONTRACT' : 'ATOMIC GROUP';
    logs.push(`⚡ Starting ${modeLabel} execution...`);
    logs.push(`📍 Sender: ${activeAddress.slice(0, 8)}...${activeAddress.slice(-6)}`);
    logs.push(`🌐 Network: ${networkName}`);
    logs.push(`🔧 Mode: ${modeLabel}`);
    logs.push('');
    setExecutionLog([...logs]);

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

    logs.push('');
    logs.push(`───── ${modeLabel} EXECUTION COMPLETE ─────`);
    setExecutionLog([...logs]);
    setIsExecuting(false);

    // Refresh balance after execution
    if (activeAddress && onBalanceUpdate) {
      try {
        const bal = await fetchAccountBalance(activeAddress);
        onBalanceUpdate(bal.balanceAlgos);
      } catch { /* ignore */ }
    }
  }, [executionMode, executeDirect, executeViaContract, executeAtomic, activeAddress, transactionSigner, networkName, onBalanceUpdate]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="workspace-layout">
      {/* ── Left Sidebar: Node Palette ────── */}
      <div className="sidebar">
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
                      {!def.isReal && ' (mock)'}
                    </div>
                  </div>
                  <span className={`tag tag-sm ${def.isReal ? 'tag-real' : 'tag-mock'}`}>
                    {def.isReal ? 'REAL' : 'MOCK'}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* ── Canvas ────────────────────────── */}
      <div
        className="canvas-container"
        ref={canvasRef}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onClick={() => {
          setSelectedNodeId(null);
          setConnectingFrom(null);
        }}
      >
        {/* SVG for edges */}
        <svg
          ref={svgRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {edges.map((edge) => {
            const src = nodes.find((n) => n.id === edge.source);
            const tgt = nodes.find((n) => n.id === edge.target);
            if (!src || !tgt) return null;

            const x1 = src.position.x + 200;
            const y1 = src.position.y + 25;
            const x2 = tgt.position.x;
            const y2 = tgt.position.y + 25;
            const mx = (x1 + x2) / 2;

            return (
              <path
                key={edge.id}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                className="connection-line"
                style={{ pointerEvents: 'stroke' }}
              />
            );
          })}
        </svg>

        {/* Canvas Nodes */}
        {nodes.map((node) => (
          <div
            key={node.id}
            className={`canvas-node ${selectedNodeId === node.id ? 'selected' : ''}`}
            style={{
              left: node.position.x,
              top: node.position.y,
            }}
            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedNodeId(node.id);
            }}
          >
            {/* Input Port */}
            {node.category !== 'trigger' && (
              <div
                className="canvas-node-port port-input"
                style={{ background: connectingFrom ? 'var(--color-accent)' : 'var(--color-border)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePortClick(node.id, false);
                }}
              />
            )}

            {/* Header */}
            <div className="canvas-node-header" style={{ borderLeftColor: node.color }}>
              <span style={{ fontSize: '14px' }}>{node.icon}</span>
              <span style={{ flex: 1 }}>{node.label}</span>
              {!node.isReal && (
                <span className="tag tag-sm tag-mock" style={{ fontSize: '0.55rem', padding: '1px 4px' }}>
                  MOCK
                </span>
              )}
            </div>

            {/* Body */}
            <div className="canvas-node-body">
              <div className="text-mono" style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
                {node.type}
              </div>
              {node.type === 'send_payment' && (
                <div style={{ marginTop: '4px', color: 'var(--color-text-secondary)' }}>
                  {(node.config.amount as number) / 1000000} ALGO
                </div>
              )}
            </div>

            {/* Output Port */}
            <div
              className="canvas-node-port port-output"
              style={{ background: connectingFrom === node.id ? 'var(--color-accent)' : 'var(--color-border)' }}
              onClick={(e) => {
                e.stopPropagation();
                handlePortClick(node.id, true);
              }}
            />
          </div>
        ))}

        {/* Empty State */}
        {nodes.length === 0 && (
          <div className="empty-state" style={{ height: '100%' }}>
            <div className="empty-state-icon">⬡</div>
            <div className="empty-state-title">Empty Canvas</div>
            <div className="empty-state-desc">
              Click nodes from the palette or use AI to generate a workflow
            </div>
          </div>
        )}

        {/* Connection Mode Indicator */}
        {connectingFrom && (
          <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: 'var(--color-accent)',
            color: 'white',
            borderRadius: 'var(--radius-full)',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            boxShadow: 'var(--shadow-glow)',
            zIndex: 10,
          }}>
            Click an input port to connect
          </div>
        )}
      </div>

      {/* ── Right Panel ───────────────────── */}
      <div className="right-panel">
        {/* Panel Tabs */}
        <div className="tabs">
          <button className="tab active">Properties</button>
          <button className="tab">Simulate</button>
        </div>

        {/* Node Properties */}
        {selectedNode ? (
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
                🗑
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

            {/* Config Fields */}
            <div style={{ marginTop: '16px' }}>
              <div className="text-xs text-uppercase" style={{
                letterSpacing: '0.08em',
                fontWeight: 600,
                color: 'var(--color-text-tertiary)',
                marginBottom: '8px',
              }}>
                Configuration
              </div>
              {Object.entries(selectedNode.config).map(([key, value]) => (
                <div key={key} style={{ marginBottom: '8px' }}>
                  <label className="text-xs text-muted" style={{ display: 'block', marginBottom: '3px' }}>
                    {key}
                  </label>
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
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="panel-body">
            {/* Simulation Panel */}
            <div style={{ marginBottom: '16px' }}>
              <div className="text-xs text-uppercase" style={{
                letterSpacing: '0.08em',
                fontWeight: 600,
                color: 'var(--color-text-tertiary)',
                marginBottom: '12px',
              }}>
                Workflow Stats
              </div>
              <div className="sim-panel">
                <div className="sim-row">
                  <span className="sim-label">Nodes</span>
                  <span className="sim-value">{nodes.length}</span>
                </div>
                <div className="sim-row">
                  <span className="sim-label">Connections</span>
                  <span className="sim-value">{edges.length}</span>
                </div>
                <div className="sim-row">
                  <span className="sim-label">On-Chain</span>
                  <span className="sim-value">{nodes.filter((n) => n.isReal).length}</span>
                </div>
                <div className="sim-row">
                  <span className="sim-label">Mock</span>
                  <span className="sim-value">{nodes.filter((n) => !n.isReal).length}</span>
                </div>
                {usdQuote && (
                  <div className="sim-row">
                    <span className="sim-label">Value</span>
                    <span className="sim-value sim-usd">{usdQuote}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Simulate Button */}
            <button
              className="btn btn-accent w-full"
              onClick={simulateWorkflow}
              disabled={nodes.length === 0 || isSimulating}
            >
              {isSimulating ? (
                <>
                  <span className="loading-spinner"></span>
                  SIMULATING...
                </>
              ) : (
                '▶ SIMULATE WORKFLOW'
              )}
            </button>

            {/* ── Execution Mode Toggle ────── */}
            <div style={{ marginTop: '16px' }}>
              <div className="text-xs text-uppercase" style={{
                letterSpacing: '0.08em',
                fontWeight: 600,
                color: 'var(--color-text-tertiary)',
                marginBottom: '8px',
              }}>
                Execution Mode
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '4px',
                background: 'var(--color-bg-input)',
                borderRadius: 'var(--radius-md)',
                padding: '3px',
                border: '1px solid var(--color-border)',
              }}>
                {(['direct', 'contract', 'atomic'] as ExecutionMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setExecutionMode(mode)}
                    style={{
                      padding: '6px 4px',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      transition: 'all 0.15s',
                      background: executionMode === mode ? 'var(--color-accent)' : 'transparent',
                      color: executionMode === mode ? 'var(--color-black)' : 'var(--color-text-tertiary)',
                    }}
                  >
                    {mode === 'direct' ? '⚡ Direct' : mode === 'contract' ? '📱 Contract' : '⛓ Atomic'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted" style={{ marginTop: '4px', lineHeight: '1.4' }}>
                {executionMode === 'direct' && 'Individual L1 transactions, signed one-by-one.'}
                {executionMode === 'contract' && 'Execute via WorkflowExecutor smart contract.'}
                {executionMode === 'atomic' && 'Group all transactions + app call atomically.'}
              </p>
            </div>

            {/* ── Contract State ────────────── */}
            {(executionMode === 'contract' || executionMode === 'atomic') && (
              <div className="sim-panel" style={{ marginTop: '12px' }}>
                <div className="sim-row">
                  <span className="sim-label">App ID</span>
                  <span className="sim-value">
                    {getAppId() > 0 ? (
                      <a
                        href={getAppExplorerUrl(getAppId(), networkName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        {getAppId()}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--color-error)' }}>NOT SET</span>
                    )}
                  </span>
                </div>
                {contractState && (
                  <>
                    <div className="sim-row">
                      <span className="sim-label">Executions</span>
                      <span className="sim-value">{contractState.totalExecutions}</span>
                    </div>
                    <div className="sim-row">
                      <span className="sim-label">Workflows</span>
                      <span className="sim-value">{contractState.workflowCount}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Execute Button */}
            <div style={{ marginTop: '12px' }}>
              <button
                className="btn btn-primary w-full"
                disabled={nodes.length === 0 || !activeAddress || isExecuting}
                onClick={executeWorkflow}
              >
                {isExecuting ? (
                  <>
                    <span className="loading-spinner"></span>
                    EXECUTING...
                  </>
                ) : executionMode === 'direct' ? (
                  '⚡ EXECUTE ON-CHAIN'
                ) : executionMode === 'contract' ? (
                  '📱 EXECUTE VIA CONTRACT'
                ) : (
                  '⛓ EXECUTE ATOMIC GROUP'
                )}
              </button>
              {!activeAddress && (
                <p className="text-xs text-muted" style={{ marginTop: '6px', textAlign: 'center' }}>
                  Connect wallet to execute
                </p>
              )}
              {activeAddress && (
                <p className="text-xs" style={{ marginTop: '6px', textAlign: 'center', color: 'var(--color-success)' }}>
                  <span className="status-dot status-dot-success" style={{ marginRight: '4px' }}></span>
                  Wallet connected • {networkName}
                </p>
              )}
            </div>

            {/* Execution Log */}
            {executionLog.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div className="text-xs text-uppercase" style={{
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                  color: 'var(--color-accent)',
                  marginBottom: '8px',
                }}>
                  ⚡ Execution Log
                </div>
                <div style={{
                  background: 'var(--color-bg-input)',
                  border: '1px solid var(--color-border-accent)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  lineHeight: '1.8',
                }}>
                  {executionLog.map((line, i) => (
                    <div key={i} className="animate-slideUp" style={{ animationDelay: `${i * 30}ms` }}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Simulation Results */}
            {simResults.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div className="text-xs text-uppercase" style={{
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  marginBottom: '8px',
                }}>
                  Simulation Log
                </div>
                <div style={{
                  background: 'var(--color-bg-input)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  lineHeight: '1.8',
                }}>
                  {simResults.map((line, i) => (
                    <div key={i} className="animate-slideUp" style={{ animationDelay: `${i * 50}ms` }}>
                      {line}
                    </div>
                  ))}
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
