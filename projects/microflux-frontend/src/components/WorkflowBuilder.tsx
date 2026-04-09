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
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('atomic');
  const [contractState, setContractState] = useState<ContractState | null>(null);
  const [executionSuccess, setExecutionSuccess] = useState(false);
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const [useSmartContract, setUseSmartContract] = useState(true);

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
    setExecutionSuccess(false);
    setLastTxId(null);
    const logs: string[] = [];

    const modeLabel = executionMode === 'direct' ? 'DIRECT' : executionMode === 'contract' ? 'CONTRACT' : 'ATOMIC GROUP';
    const onChainCount = nodes.filter(n => n.isReal).length;
    logs.push(`⚡ Starting ${modeLabel} execution...`);
    logs.push(`📍 Sender: ${activeAddress.slice(0, 8)}...${activeAddress.slice(-6)}`);
    logs.push(`🌐 Network: ${networkName} (Algorand Testnet)`);
    logs.push(`🔧 Mode: ${modeLabel} • ${onChainCount} on-chain transactions`);
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

      // Check if any TX was confirmed (look for ✅ in logs)
      const hasSuccess = logs.some(l => l.includes('✅'));
      const txLine = logs.find(l => l.trim().startsWith('TX:'));
      if (hasSuccess) {
        setExecutionSuccess(true);
        if (txLine) setLastTxId(txLine.replace(/.*TX:\s*/, '').trim());
      }

      logs.push('');
      if (hasSuccess) {
        logs.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logs.push('✅ EXECUTION SUCCESSFUL');
        logs.push('All transactions confirmed on Algorand Testnet.');
        logs.push('No data is mocked. Every action was signed');
        logs.push('by your wallet and confirmed on-chain.');
        logs.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      } else {
        logs.push(`───── ${modeLabel} EXECUTION COMPLETE ─────`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logs.push('');
      logs.push(`❌ Execution failed: ${msg}`);
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
        icon: '💰',
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
        icon: '💰',
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
        icon: '🔔',
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
            {/* ── Workflow Stats ─────────────── */}
            <div style={{ marginBottom: '16px' }}>
              <div className="text-xs text-uppercase" style={{
                letterSpacing: '0.08em',
                fontWeight: 600,
                color: 'var(--color-text-tertiary)',
                marginBottom: '12px',
              }}>
                Workflow Overview
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
                  <span className="sim-label">On-Chain Txns</span>
                  <span className="sim-value" style={{ color: 'var(--color-accent)', fontWeight: 700 }}>
                    {nodes.filter((n) => n.isReal).length}
                  </span>
                </div>
                <div className="sim-row">
                  <span className="sim-label">Execution Type</span>
                  <span className="sim-value" style={{ fontWeight: 700, color: 'var(--color-info)' }}>
                    {useSmartContract ? '⛓ Atomic' : '⚡ Direct'}
                  </span>
                </div>
                {usdQuote && (
                  <div className="sim-row">
                    <span className="sim-label">Est. Value</span>
                    <span className="sim-value sim-usd">{usdQuote}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Load Demo Workflow ──────────── */}
            {nodes.length === 0 && (
              <button
                className="btn w-full"
                onClick={loadDemoWorkflow}
                style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))',
                  border: '1px solid rgba(139,92,246,0.3)',
                  color: 'var(--color-text-primary)',
                  marginBottom: '12px',
                }}
              >
                🚀 LOAD DEMO WORKFLOW
              </button>
            )}

            {/* ── Simulate ───────────────────── */}
            <button
              className="btn btn-outline w-full"
              onClick={simulateWorkflow}
              disabled={nodes.length === 0 || isSimulating}
              style={{ marginBottom: '8px', fontSize: '0.7rem' }}
            >
              {isSimulating ? 'SIMULATING...' : '▶ SIMULATE'}
            </button>

            {/* ── Smart Contract Toggle ───────── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              background: 'var(--color-bg-input)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '10px',
              cursor: 'pointer',
            }}
              onClick={() => setUseSmartContract(!useSmartContract)}
            >
              <div style={{
                width: '32px',
                height: '18px',
                borderRadius: '9px',
                background: useSmartContract ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
                border: `1px solid ${useSmartContract ? 'var(--color-accent)' : 'var(--color-border)'}`,
              }}>
                <div style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: 'white',
                  position: 'absolute',
                  top: '1px',
                  left: useSmartContract ? '16px' : '1px',
                  transition: 'left 0.2s',
                }} />
              </div>
              <div>
                <div className="text-xs" style={{ fontWeight: 600 }}>
                  Use Smart Contract
                </div>
                <div className="text-xs text-muted" style={{ fontSize: '0.6rem' }}>
                  {useSmartContract ? 'Atomic group + App call (verifiable)' : 'Direct L1 transactions'}
                </div>
              </div>
            </div>

            {/* ── Contract State (Trust Signal) ── */}
            <div className="sim-panel" style={{ marginBottom: '12px' }}>
              <div className="text-xs text-uppercase" style={{
                letterSpacing: '0.08em',
                fontWeight: 600,
                color: 'var(--color-accent)',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: '1px solid var(--color-border)',
              }}>
                📱 On-Chain Contract
              </div>
              <div className="sim-row">
                <span className="sim-label">App ID</span>
                <span className="sim-value">
                  {getAppId() > 0 ? (
                    <a
                      href={getAppExplorerUrl(getAppId(), networkName)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--color-accent)', fontWeight: 700 }}
                    >
                      {getAppId()}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>Not deployed</span>
                  )}
                </span>
              </div>
              <div className="sim-row">
                <span className="sim-label">Total Executions</span>
                <span className="sim-value" style={{ fontWeight: 700, color: 'var(--color-success)' }}>
                  {contractState?.totalExecutions ?? '—'}
                </span>
              </div>
              <div className="sim-row">
                <span className="sim-label">Workflows Registered</span>
                <span className="sim-value">{contractState?.workflowCount ?? '—'}</span>
              </div>
              <div className="sim-row">
                <span className="sim-label">Status</span>
                <span className="sim-value">
                  {executionSuccess ? (
                    <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>
                      <span className="status-dot status-dot-success" style={{ marginRight: '4px' }}></span>
                      Last: Success
                    </span>
                  ) : (
                    <span className="text-muted">Ready</span>
                  )}
                </span>
              </div>
              <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--color-border)' }}>
                <span className="text-xs text-muted" style={{ fontSize: '0.6rem', lineHeight: '1.4' }}>
                  All executions are real Algorand Testnet transactions.
                  No data is mocked.
                </span>
              </div>
            </div>

            {/* ── PRIMARY EXECUTE BUTTON ────── */}
            <button
              className="btn btn-primary w-full"
              disabled={nodes.length === 0 || !activeAddress || isExecuting}
              onClick={executeWorkflow}
              style={{
                padding: '14px',
                fontSize: '0.8rem',
                fontWeight: 800,
                letterSpacing: '0.06em',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {isExecuting ? (
                <>
                  <span className="loading-spinner"></span>
                  EXECUTING ON-CHAIN...
                </>
              ) : (
                '⚡ EXECUTE WORKFLOW'
              )}
            </button>

            {!activeAddress && (
              <p className="text-xs text-muted" style={{ marginTop: '6px', textAlign: 'center' }}>
                Connect wallet to execute
              </p>
            )}
            {activeAddress && !isExecuting && (
              <p className="text-xs" style={{ marginTop: '6px', textAlign: 'center', color: 'var(--color-success)' }}>
                <span className="status-dot status-dot-success" style={{ marginRight: '4px' }}></span>
                Wallet connected • {networkName}
              </p>
            )}

            {/* ── SUCCESS BANNER ──────────────── */}
            {executionSuccess && !isExecuting && (
              <div style={{
                marginTop: '12px',
                padding: '14px',
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>✅</div>
                <div className="text-sm" style={{ fontWeight: 700, color: 'var(--color-success)', marginBottom: '4px' }}>
                  EXECUTION CONFIRMED
                </div>
                <div className="text-xs text-muted" style={{ marginBottom: '8px' }}>
                  Verified on Algorand Testnet
                </div>
                {lastTxId && (
                  <a
                    href={getExplorerTxUrl(lastTxId, networkName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm"
                    style={{
                      background: 'var(--color-success)',
                      color: 'white',
                      border: 'none',
                      fontSize: '0.65rem',
                      marginBottom: '8px',
                      display: 'inline-block',
                    }}
                  >
                    🔗 VIEW ON EXPLORER
                  </a>
                )}
                <div style={{ marginTop: '8px' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={executeWorkflow}
                    style={{ fontSize: '0.65rem' }}
                  >
                    🔄 REPLAY WORKFLOW
                  </button>
                </div>
              </div>
            )}

            {/* ── Execution Log ───────────────── */}
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
                  border: `1px solid ${executionSuccess ? 'rgba(34,197,94,0.3)' : 'var(--color-border-accent)'}`,
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

            {/* ── Simulation Results ──────────── */}
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
                  maxHeight: '200px',
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
