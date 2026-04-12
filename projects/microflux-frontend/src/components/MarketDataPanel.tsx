import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid,
  ComposedChart, Bar, Cell,
} from 'recharts';
import {
  getTinymanPrice, getMultiplePrices, formatChange, getTokenName,
  getKlines, getOrderBook,
  type TinymanPrice, type PricePoint, type Kline, type OrderBookEntry,
} from '../services/tinymanDataService';
import {
  getPortfolio, updatePortfolioValue, executeBuy, executeSell,
  getPaymentLogs, resetPortfolio, getAIStrategy, executeAIDecision,
  logRealTrade, logRealPayment,
  type Portfolio, type AIDecision, type PaymentLog,
} from '../services/paperTradingService';
import {
  createCondition, cancelCondition, markExecuted, evaluateConditions,
  getConditions, getMetConditions, getAgentState, clearAllConditions,
  formatCondition, getActionLabel, getStatusColor,
  type MarketCondition, type ConditionOperator, type ConditionAction, type AgentState,
} from '../services/conditionService';
import algosdk from 'algosdk';
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs';
import { executeSwap } from '../services/tinymanService';
// ── Props ────────────────────────────────────
interface MarketDataPanelProps {
  activeAddress?: string | null;
  transactionSigner?: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>;
  networkName?: string;
}

// ── Sub-tab type ─────────────────────────────
type BottomTab = 'trades' | 'conditions' | 'payments' | 'ai' | 'explorer';

// ── Main Component ───────────────────────────
const MarketDataPanel: React.FC<MarketDataPanelProps> = ({
  activeAddress,
  transactionSigner,
  networkName,
}) => {
  // Price State
  const [selectedBaseAsset, setSelectedBaseAsset] = useState('ALGO');
  const [algoPrice, setAlgoPrice] = useState<TinymanPrice | null>(null);
  const [otherPrices, setOtherPrices] = useState<TinymanPrice[]>([]);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [lastUpdate, setLastUpdate] = useState('');

  // Portfolio State
  const [portfolio, setPortfolio] = useState<Portfolio>(getPortfolio());
  const [payments, setPayments] = useState<PaymentLog[]>([]);

  // Trade Input
  const [tradeAmount, setTradeAmount] = useState('100');
  const [tradeAction, setTradeAction] = useState<'BUY' | 'SELL'>('BUY');

  // AI Agent State
  const [aiDecision, setAiDecision] = useState<AIDecision | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [autoMode, setAutoMode] = useState(false);
  const [autoExecuteAgent, setAutoExecuteAgent] = useState(false);
  const autoExecRef = useRef(false);
  useEffect(() => { autoExecRef.current = autoExecuteAgent; }, [autoExecuteAgent]);

  // Condition Agent State
  const [condOperator, setCondOperator] = useState<ConditionOperator>('lt');
  const [condPrice, setCondPrice] = useState('0.10');
  const [condAction, setCondAction] = useState<ConditionAction>('send_payment');
  const [condAmount, setCondAmount] = useState('10');
  const [condReceiver, setCondReceiver] = useState('');
  const [conditionsList, setConditionsList] = useState<MarketCondition[]>(getConditions());
  const [agent, setAgent] = useState<AgentState>(getAgentState());
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [execMessage, setExecMessage] = useState('');

  // Chart Data State
  const [klines, setKlines] = useState<Kline[]>([]);
  const [orderBook, setOrderBook] = useState<{ bids: OrderBookEntry[]; asks: OrderBookEntry[] }>({ bids: [], asks: [] });
  const [chartInterval, setChartInterval] = useState('1h');

  // UI State
  const [activeTab, setActiveTab] = useState<BottomTab>('conditions');
  const [loading, setLoading] = useState(true);
  const [tradeNotif, setTradeNotif] = useState('');
  const [rightPanel, setRightPanel] = useState<'trade' | 'agent' | 'recurring'>('trade');
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // ── Avoid Stale Closures & Race Conditions ──
  const handleExecuteConditionRef = useRef<((cond: MarketCondition) => Promise<void>) | null>(null);
  const activeExecutionsRef = useRef<Set<string>>(new Set());

  // ── Fetch Prices & Evaluate Conditions ───
  const fetchPrices = useCallback(async () => {
    try {
      const allTokens = ['ALGO', 'BTC', 'ETH', 'SOL'];
      const [base, others] = await Promise.all([
        getTinymanPrice(selectedBaseAsset),
        getMultiplePrices(allTokens.filter(t => t !== selectedBaseAsset)),
      ]);
      setAlgoPrice(base);
      setOtherPrices(others);
      setLastUpdate(new Date().toLocaleTimeString());

      setPriceHistory(prev => {
        const next = [...prev, {
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          price: base.price,
          timestamp: Date.now(),
        }];
        return next.slice(-60);
      });

      const updated = updatePortfolioValue(base.price);
      setPortfolio(updated);

      // Evaluate conditions against live price
      const newlyMet = evaluateConditions(base.price);
      if (newlyMet.length > 0) {
        setTradeNotif(`Condition triggered: ${formatCondition(newlyMet[0])}`);
        setTimeout(() => setTradeNotif(''), 5000);
      }
      
      // Auto-Execute ALL met conditions autonomously to the connected wallet
      const allMet = getMetConditions();
      if (allMet.length > 0) {
        setTimeout(() => {
          allMet.forEach(cond => {
            if (handleExecuteConditionRef.current) {
              handleExecuteConditionRef.current(cond);
            }
          });
        }, 1000);
      }

      setConditionsList(getConditions());
      setAgent(getAgentState());
    } catch (err) {
      console.error('[Market] Price fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedBaseAsset]);

  // ── Fetch Klines + Order Book ─────────────
  const fetchChartData = useCallback(async () => {
    try {
      const [klinesData, bookData] = await Promise.all([
        getKlines(selectedBaseAsset, chartInterval, 80),
        getOrderBook(selectedBaseAsset, 12),
      ]);
      setKlines(klinesData);
      setOrderBook(bookData);
    } catch (err) {
      console.error('[Market] Chart data error:', err);
    }
  }, [chartInterval, selectedBaseAsset]);

  useEffect(() => {
    fetchChartData();
    const klinesInterval = setInterval(fetchChartData, 15000);
    return () => clearInterval(klinesInterval);
  }, [fetchChartData]);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 5000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  // ── Auto AI Agent ────────────────────────
  useEffect(() => {
    if (autoMode && groqKey && algoPrice) {
      autoIntervalRef.current = setInterval(async () => {
        try {
          const decision = await getAIStrategy(algoPrice.price, groqKey);
          setAiDecision(decision);
          if (decision.action !== 'hold') {
            const result = executeAIDecision(decision, algoPrice.price);
            setAiMessage(result.message);
            setPortfolio(getPortfolio());
            setPayments(getPaymentLogs());
          } else {
            setAiMessage(decision.reason);
          }
        } catch {
          setAiMessage('AI cycle skipped');
        }
      }, 15000);
    }
    return () => { if (autoIntervalRef.current) clearInterval(autoIntervalRef.current); };
  }, [autoMode, groqKey, algoPrice]);

  // ── Create Condition ─────────────────────
  const handleCreateCondition = useCallback(() => {
    const price = parseFloat(condPrice);
    const amount = parseFloat(condAmount);
    if (isNaN(price) || isNaN(amount) || price <= 0 || amount <= 0) return;

    createCondition(condOperator, price, condAction, amount, condReceiver || undefined);
    setConditionsList(getConditions());
    setAgent(getAgentState());
    setTradeNotif(`Condition created: ${condAction === 'send_payment' ? 'Send' : condAction === 'buy_algo' ? 'Swap' : 'Execute'} ${amount} ${selectedBaseAsset} when price ${condOperator === 'lt' ? '<' : '>'} $${price.toFixed(4)}`);
    setTimeout(() => setTradeNotif(''), 3000);
  }, [condOperator, condPrice, condAction, condAmount, condReceiver, selectedBaseAsset]);

  // ── Execute On-Chain ─────────────────────
  const handleExecuteCondition = useCallback(async (cond: MarketCondition) => {
    if (!activeAddress) {
      setExecMessage('Connect your wallet to execute on-chain.');
      return;
    }
    if (!transactionSigner) {
      setExecMessage('Wallet connected, but transaction signer is unavailable. Please try reconnecting.');
      return;
    }
    if (!algoPrice) {
      setExecMessage('Waiting for live price data. Please wait a moment...');
      return;
    }

    if (activeExecutionsRef.current.has(cond.id)) {
      return;
    }
    activeExecutionsRef.current.add(cond.id);

    setExecutingId(cond.id);
    setExecMessage('Preparing transaction...');

    try {
      const config = getAlgodConfigFromViteEnvironment();
      const serverUrl = config.port
        ? `${config.server}:${config.port}`
        : config.server;
      const algod = new algosdk.Algodv2(
        (typeof config.token === 'string' ? config.token : '') as string,
        serverUrl,
        ''
      );

      const suggestedParams = await algod.getTransactionParams().do();
      const amountMicroAlgos = Math.floor(cond.amount * 1_000_000);
      
      // Use receiver address if set, otherwise send to self (for buy/sell simulation)
      const receiver = (cond.receiverAddress && cond.receiverAddress.length === 58)
        ? cond.receiverAddress
        : activeAddress;

      setExecMessage(`Sending ${cond.amount} ALGO to ${receiver.substring(0, 8)}...`);

      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: receiver,
        amount: amountMicroAlgos,
        suggestedParams,
      });

      setExecMessage('Waiting for wallet signature...');
      const signedTxns = await transactionSigner(
        [txn],
        [0]
      );

      setExecMessage('Submitting to Algorand Testnet...');

      await algod.sendRawTransaction(signedTxns[0]).do();
      const txId = txn.txID();

      await algosdk.waitForConfirmation(algod, txId, 4);

      markExecuted(cond.id, txId);
      logRealPayment(txId, '0.001 ALGO');
      setConditionsList(getConditions());
      setAgent(getAgentState());
      setPayments(getPaymentLogs());
      setExecMessage(`Confirmed on-chain: ${txId.substring(0, 16)}...`);
      setTradeNotif(`Transaction confirmed: ${txId.substring(0, 20)}...`);
      setTimeout(() => { setTradeNotif(''); setExecMessage(''); }, 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setExecMessage(msg.includes('cancelled') || msg.includes('rejected')
        ? 'Transaction cancelled by user.'
        : `Error: ${msg}`);
      setTimeout(() => setExecMessage(''), 5000);
    } finally {
      activeExecutionsRef.current.delete(cond.id);
      setExecutingId(null);
    }
  }, [activeAddress, transactionSigner, algoPrice]);

  useEffect(() => {
    handleExecuteConditionRef.current = handleExecuteCondition;
  }, [handleExecuteCondition]);

  // ── Smart Trade Routing ───────────────────
  const handleTrade = useCallback(async () => {
    if (!algoPrice) return;
    const amount = parseFloat(tradeAmount);
    if (isNaN(amount) || amount <= 0) return;

    // ── LIVE TESTNET EXECUTION ──
    if (activeAddress && transactionSigner) {
      setTradeNotif('Initiating swap on Tinyman...');
      try {
        const USDC_ID = 10458941;
        const ALGO_ID = 0;

        if (selectedBaseAsset !== 'ALGO') {
          setTradeNotif('Only ALGO/USDC swaps are supported live on Testnet.');
          setTimeout(() => setTradeNotif(''), 4000);
          return;
        }
        
        let fromAssetId = 0;
        let toAssetId = 0;

        if (tradeAction === 'SELL') {
           // Sell ALGO for USDC
           fromAssetId = ALGO_ID;
           toAssetId = USDC_ID;
        } else {
           // Buy ALGO with USDC
           fromAssetId = USDC_ID;
           toAssetId = ALGO_ID;
        }
        
        // Convert to micro units (both ALGO and testnet USDC are 6 decimals)
        const microAmount = Math.floor(amount * 1_000_000);

        // ── AUTO OPT-IN CHECK ──
        if (toAssetId !== ALGO_ID) {
           const { fetchAccountAssets } = await import('../services/walletService');
           const assets = await fetchAccountAssets(activeAddress);
           const isOptedIn = assets.some(a => a.assetId === toAssetId);
           
           if (!isOptedIn) {
              setTradeNotif(`Opting you into Asset ${toAssetId} first...`);
              try {
                  const algod = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '');
                  const suggestedParams = await algod.getTransactionParams().do();
                  const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                     sender: activeAddress,
                     receiver: activeAddress,
                     amount: 0,
                     assetIndex: toAssetId,
                     suggestedParams,
                  });
                  // Ask user to sign opt-in
                  const signedOptIn = await transactionSigner([optInTxn], [0]);
                  await algod.sendRawTransaction(signedOptIn).do();
                  await algosdk.waitForConfirmation(algod, optInTxn.txID().toString(), 4);
                  setTradeNotif('Opt-In confirmed! Generating swap quote...');
              } catch (optErr: any) {
                  setTradeNotif(`Opt-In rejected or failed: ${optErr.message}`);
                  setTimeout(() => setTradeNotif(''), 6000);
                  return;
              }
           }
        }
        
        const result = await executeSwap(
          activeAddress,
          {
            fromAssetId,
            toAssetId,
            amount: microAmount,
            slippage: 1, // 1%
          },
          transactionSigner
        );

        if (result.success && result.txId) {
          logRealTrade(
            tradeAction,
            fromAssetId === 0 ? 'ALGO' : 'USDC',
            algoPrice.price,
            tradeAction === 'BUY' ? (amount / algoPrice.price) : amount,
            tradeAction === 'BUY' ? amount : (amount * algoPrice.price),
            result.txId
          );
          setPortfolio(getPortfolio());
          setTradeNotif(`Swap Confirmed: ${result.txId.substring(0, 10)}...`);
        } else {
          setTradeNotif(`Swap Failed: ${result.error}`);
        }
        setTimeout(() => setTradeNotif(''), 5000);
      } catch (err: any) {
        setTradeNotif(err.message?.includes('cancelled') ? 'Swap cancelled by user' : `Failed: ${err.message}`);
        setTimeout(() => setTradeNotif(''), 6000);
      }
      return;
    }

    // ── PAPER TRADE FALLBACK (IF NO WALLET) ──
    const result = tradeAction === 'BUY'
      ? executeBuy(algoPrice.price, amount)
      : executeSell(algoPrice.price, amount);
    if (result.success && result.trade) {
      setTradeNotif(`${result.trade.action}: ${result.trade.amount.toFixed(2)} ${selectedBaseAsset} at $${result.trade.price.toFixed(4)}`);
      setTimeout(() => setTradeNotif(''), 3000);
    } else {
      setTradeNotif(result.error ?? 'Trade failed');
      setTimeout(() => setTradeNotif(''), 3000);
    }
    setPortfolio(getPortfolio());
    setPayments(getPaymentLogs());
  }, [algoPrice, tradeAmount, tradeAction, activeAddress, transactionSigner, selectedBaseAsset]);

  // ── AI Strategy ──────────────────────────
  const runAIStrategy = useCallback(async () => {
    if (!algoPrice || !groqKey) return;
    setAiLoading(true);
    setAiMessage('');
    try {
      const decision = await getAIStrategy(algoPrice.price, groqKey);
      setAiDecision(decision);
      setAiMessage(`AI suggests: ${decision.action.toUpperCase()} — ${decision.reason}`);
    } catch (err) {
      setAiMessage(err instanceof Error ? err.message : 'AI error');
    } finally {
      setAiLoading(false);
    }
  }, [algoPrice, groqKey]);

  const executeAI = useCallback(() => {
    if (!aiDecision || !algoPrice) return;
    const result = executeAIDecision(aiDecision, algoPrice.price);
    setAiMessage(result.message);
    setPortfolio(getPortfolio());
    setPayments(getPaymentLogs());
    setAiDecision(null);
  }, [aiDecision, algoPrice]);

  const handleReset = useCallback(() => {
    resetPortfolio();
    clearAllConditions();
    setPortfolio(getPortfolio());
    setPayments([]);
    setConditionsList([]);
    setAgent(getAgentState());
    setAiDecision(null);
    setAiMessage('');
    setTradeNotif('Portfolio and conditions reset');
    setTimeout(() => setTradeNotif(''), 3000);
  }, []);

  // ── Loading ──────────────────────────────
  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">MARKET TERMINAL</h1>
          <p className="page-subtitle">Connecting to Tinyman V2...</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: '100px' }}></div>
          ))}
        </div>
      </div>
    );
  }

  const pnlColor = portfolio.pnl >= 0 ? 'var(--color-success)' : 'var(--color-error)';
  const pnlSign = portfolio.pnl >= 0 ? '+' : '';
  const agentStatusColor =
    agent.status === 'condition_met' ? 'var(--color-warning)' :
    agent.status === 'monitoring' ? 'var(--color-success)' :
    agent.status === 'executing' ? 'var(--color-accent)' :
    'var(--color-text-tertiary)';
  const metConditions = getMetConditions();

  return (
    <div className="page-container animate-fadeIn">
      {/* ── Header ──────────────────────────── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">MARKET TERMINAL</h1>
          <p className="page-subtitle">
            Real-time Tinyman V2 DeFi data &middot; Conditional Workflows &middot; On-chain Execution
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '3px 10px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
            background: agentStatusColor === 'var(--color-warning)' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(34, 197, 94, 0.08)',
            border: `1px solid ${agentStatusColor === 'var(--color-warning)' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(34, 197, 94, 0.2)'}`,
            color: agentStatusColor, letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: agentStatusColor, display: 'inline-block' }} />
            {agent.status === 'condition_met' ? 'Action Required' :
             agent.status === 'monitoring' ? 'Monitoring' :
             agent.status === 'executing' ? 'Executing' : 'Standby'}
          </span>
          <span className="text-xs text-muted">{lastUpdate}</span>
          <button className="btn btn-ghost btn-sm" onClick={fetchPrices}>REFRESH</button>
        </div>
      </div>

      {/* ── Agent Alert Bar ─────────────────── */}
      {metConditions.length > 0 && (
        <div style={{
          padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(234, 179, 8, 0.06)', border: '1px solid rgba(234, 179, 8, 0.3)',
        }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '4px' }}>
              CONDITION MET — AWAITING APPROVAL
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {formatCondition(metConditions[0])} — Triggered at {metConditions[0].triggeredAt}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => handleExecuteCondition(metConditions[0])}
            disabled={executingId !== null || !activeAddress}
            style={{ background: 'var(--color-warning)', color: '#000', fontWeight: 700, border: 'none' }}
          >
            {executingId ? 'Executing...' : !activeAddress ? 'Connect Wallet' : 'Execute Workflow'}
          </button>
        </div>
      )}

      {/* ── Notification Bar ────────────────── */}
      {tradeNotif && (
        <div style={{
          padding: '10px 16px', marginBottom: '16px',
          background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.3)',
          color: 'var(--color-success)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
        }}>
          {tradeNotif}
        </div>
      )}

      {execMessage && (
        <div style={{
          padding: '10px 16px', marginBottom: '16px',
          background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.3)',
          color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
        }}>
          {execMessage}
        </div>
      )}

      {/* ── Top Price Cards ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {algoPrice && (
          <div className="card" style={{ borderColor: 'var(--color-border-accent)', background: 'linear-gradient(135deg, var(--color-bg-card) 0%, rgba(37, 99, 235, 0.04) 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{getTokenName('ALGO')}</span>
              <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: algoPrice.changePercent24h >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                {formatChange(algoPrice.changePercent24h).text}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 700 }}>${algoPrice.price.toFixed(4)}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>ALGO/USDT</div>
          </div>
        )}
        {otherPrices.map((token) => (
          <div key={token.symbol} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{getTokenName(token.symbol)}</span>
              <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: token.changePercent24h >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                {formatChange(token.changePercent24h).text}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>${token.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>{token.symbol}/USDT</div>
          </div>
        ))}
      </div>

      {/* ── Main Grid: Chart + Order Book + Right Panel ──── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', marginBottom: '20px' }}>
        {/* Left: Professional Chart mimicking Tinyman (Dark Theme) */}
        <div className="card" style={{ padding: '0', overflow: 'hidden', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
          {/* Chart Header matching Tinyman */}
          <div style={{ padding: '24px 24px 0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', background: '#000', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', border: '1px solid var(--color-border)' }}>{selectedBaseAsset.charAt(0)}</div>
                <div style={{ width: '28px', height: '28px', background: '#2775ca', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', marginLeft: '-12px', border: '2px solid var(--color-bg-secondary)' }}>$</div>
                <select 
                  value={selectedBaseAsset}
                  onChange={(e) => setSelectedBaseAsset(e.target.value)}
                  style={{ fontSize: '18px', fontWeight: 600, margin: 0, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', marginLeft: '4px', background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer', appearance: 'none' }}
                >
                  <option value="ALGO">ALGO / USDC</option>
                  <option value="BTC">BTC / USDC</option>
                  <option value="ETH">ETH / USDC</option>
                  <option value="SOL">SOL / USDC</option>
                </select>
                <span style={{ color: 'var(--color-text-tertiary)', marginLeft: '4px', fontSize: '18px' }}>⇄</span>
              </div>
              <button style={{ padding: '8px 16px', background: 'var(--color-bg-tertiary)', border: 'none', borderRadius: '16px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>HIDE</button>
            </div>
            
            {algoPrice && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '24px', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>{selectedBaseAsset} price</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>${algoPrice.price.toFixed(9)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>24h Price Change</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: algoPrice.changePercent24h >= 0 ? 'var(--color-success)' : 'var(--color-error)', fontFamily: 'var(--font-mono)' }}>{algoPrice.changePercent24h >= 0 ? '' : ''}{algoPrice.changePercent24h.toFixed(2)}% {algoPrice.changePercent24h >= 0 ? '↗' : '↘'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>24h Volume</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>${(algoPrice.volume24h).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>Liquidity</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>$2,109,470.23</div>
                </div>
              </div>
            )}
            
            {/* Chart Nav & OHLC values */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                 <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: 500 }}>D</span>
                 <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: 500 }}>Candles</span>
                 <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: 500 }}>Indicators</span>
              </div>
            </div>
            
            {/* OHLC from latest kline */}
            {klines.length > 0 && (
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>
                <span>O <span style={{ color: 'var(--color-error)' }}>{klines[klines.length - 1].open.toFixed(4)}</span></span>
                <span>H <span style={{ color: 'var(--color-error)' }}>{klines[klines.length - 1].high.toFixed(4)}</span></span>
                <span>L <span style={{ color: 'var(--color-error)' }}>{klines[klines.length - 1].low.toFixed(4)}</span></span>
                <span>C <span style={{ color: klines[klines.length - 1].close >= klines[klines.length - 1].open ? 'var(--color-success)' : 'var(--color-error)' }}>{klines[klines.length - 1].close.toFixed(4)}</span></span>
              </div>
            )}
          </div>

          {/* Main Chart Area */}
          <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ width: '100%', height: 320 }}>
              {klines.length > 0 ? (
                <ResponsiveContainer>
                  <ComposedChart data={klines} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg-tertiary)" vertical={true} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tickLine={false}
                      interval={Math.max(Math.floor(klines.length / 6), 1)}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}
                      axisLine={false}
                      tickLine={false}
                      width={65}
                      tickFormatter={(v: number) => v.toFixed(4)}
                      orientation="right"
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '12px', fontFamily: 'var(--font-mono)', padding: '8px 12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}
                      itemStyle={{ color: '#ffffff' }}
                      labelStyle={{ color: 'var(--color-text-tertiary)', marginBottom: '4px' }}
                      formatter={(value: any) => [Number(value).toFixed(4), 'Price']}
                    />
                    <Bar dataKey="close" barSize={4}>
                      {klines.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.close >= entry.open ? 'var(--color-success)' : 'var(--color-error)'} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                  Loading chart data...
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px 0', fontSize: '12px', color: 'var(--color-text-secondary)', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span>5y</span><span>1y</span><span>6m</span><span>3m</span><span>5d</span><span>1d</span><span style={{ fontWeight: 600 }}>📅</span>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span>15:49:52 (UTC)</span><span>%</span><span>log</span><span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>auto</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Tinyman Style Swap Card (Dark Theme) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="card" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', padding: '24px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '16px', fontWeight: 500 }}>
              TRENDING #1 RIO <span style={{ color: 'var(--color-success)' }}>14.88% ↗</span> #2 native <span style={{ color: 'var(--color-success)' }}>10.97% ↗</span>
            </div>
          
            <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--color-border)', marginBottom: '24px', paddingBottom: '12px' }}>
               <button onClick={() => setRightPanel('trade')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: rightPanel === 'trade' ? 700 : 500, color: rightPanel === 'trade' ? 'var(--color-text-primary)' : 'var(--color-text-muted)', borderBottom: rightPanel === 'trade' ? '2px solid var(--color-text-primary)' : 'none', paddingBottom: '12px', marginBottom: '-13px', cursor: 'pointer' }}>Swap</button>
               <button onClick={() => setRightPanel('agent')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: rightPanel === 'agent' ? 700 : 500, color: rightPanel === 'agent' ? 'var(--color-text-primary)' : 'var(--color-text-muted)', borderBottom: rightPanel === 'agent' ? '2px solid var(--color-text-primary)' : 'none', paddingBottom: '12px', marginBottom: '-13px', cursor: 'pointer' }}>Trigger AI</button>
               <button onClick={() => setRightPanel('recurring')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: rightPanel === 'recurring' ? 700 : 500, color: rightPanel === 'recurring' ? 'var(--color-text-primary)' : 'var(--color-text-muted)', borderBottom: rightPanel === 'recurring' ? '2px solid var(--color-text-primary)' : 'none', paddingBottom: '12px', marginBottom: '-13px', cursor: 'pointer' }}>Recurring ⓘ</button>
            </div>
            
            {rightPanel === 'trade' ? (
              <>
                <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>You Pay</div>
                <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   {tradeAction === 'SELL' ? (
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                       <div style={{ width: '28px', height: '28px', background: '#000', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>{selectedBaseAsset.charAt(0)}</div>
                       <div>
                         <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--color-text-primary)' }}>{selectedBaseAsset === 'ALGO' ? 'Algorand' : selectedBaseAsset} <span style={{ color: 'var(--color-success)' }}>✓</span></div>
                         <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>${selectedBaseAsset}</div>
                       </div>
                     </div>
                   ) : (
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                       <div style={{ width: '28px', height: '28px', background: '#2775ca', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>$</div>
                       <div>
                         <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--color-text-primary)' }}>USDC <span style={{ color: '#3b82f6' }}>✓</span></div>
                         <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>$USDC - 31566704</div>
                       </div>
                     </div>
                   )}
                   <input type="number" value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)} style={{ textAlign: 'right', fontSize: '24px', border: 'none', background: 'none', width: '50%', color: 'var(--color-text-primary)', outline: 'none' }} placeholder="0.00" />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0', color: 'var(--color-text-muted)', fontSize: '20px', cursor: 'pointer' }} onClick={() => setTradeAction(tradeAction === 'BUY' ? 'SELL' : 'BUY')}>
                  ⇅
                </div>
                
                <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>You Receive</div>
                <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                   {tradeAction === 'BUY' ? (
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                       <div style={{ width: '28px', height: '28px', background: '#000', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>{selectedBaseAsset.charAt(0)}</div>
                       <div>
                         <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--color-text-primary)' }}>{selectedBaseAsset === 'ALGO' ? 'Algorand' : selectedBaseAsset} <span style={{ color: 'var(--color-success)' }}>✓</span></div>
                         <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>${selectedBaseAsset}</div>
                       </div>
                     </div>
                   ) : (
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                       <div style={{ width: '28px', height: '28px', background: '#2775ca', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>$</div>
                       <div>
                         <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--color-text-primary)' }}>USDC <span style={{ color: '#3b82f6' }}>✓</span></div>
                         <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>$USDC - 31566704</div>
                       </div>
                     </div>
                   )}
                   <input type="number" disabled value={algoPrice ? (parseFloat(tradeAmount || '0') * (tradeAction === 'BUY' ? (1/algoPrice.price) : algoPrice.price)).toFixed(2) : '0.00'} style={{ textAlign: 'right', fontSize: '24px', border: 'none', background: 'none', width: '50%', color: 'var(--color-text-primary)', outline: 'none' }} placeholder="0.00" />
                </div>
                
                <button onClick={handleTrade} style={{ width: '100%', background: '#e0ff4f', color: '#000', padding: '16px', borderRadius: '8px', border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {activeAddress ? 'SWAP' : 'CONNECT TO A WALLET'}
                </button>
              </>
            ) : rightPanel === 'agent' ? (
              <>
                <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>When Price Reaches</div>
                <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '16px', display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
                   <select value={condOperator} onChange={(e) => setCondOperator(e.target.value as ConditionOperator)} style={{ padding: '8px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '14px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', outline: 'none' }}>
                     <option value="lt">&lt; Less Than</option>
                     <option value="gt">&gt; Greater Than</option>
                   </select>
                   <input type="number" value={condPrice} onChange={(e) => setCondPrice(e.target.value)} style={{ flex: 1, fontSize: '20px', border: 'none', background: 'none', color: 'var(--color-text-primary)', outline: 'none' }} placeholder="$0.00" />
                </div>
                
                <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Then Execute</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: autoExecuteAgent ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    <input type="checkbox" checked={autoExecuteAgent} onChange={(e) => setAutoExecuteAgent(e.target.checked)} style={{ accentColor: 'var(--color-success)' }} />
                    Auto-Sign Agent ⚡
                  </label>
                </div>
                <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                   <select value={condAction} onChange={(e) => setCondAction(e.target.value as ConditionAction)} style={{ padding: '8px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '14px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', outline: 'none', width: '100%' }}>
                     <option value="buy_algo">Swap {selectedBaseAsset}</option>
                     <option value="send_payment">Send Payment</option>
                   </select>
                   <input type="number" value={condAmount} onChange={(e) => setCondAmount(e.target.value)} style={{ fontSize: '20px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-bg-secondary)', padding: '8px', color: 'var(--color-text-primary)', outline: 'none', width: '100%' }} placeholder="Amount" />
                   {(condAction === 'send_payment') && (
                     <input type="text" value={condReceiver} onChange={(e) => setCondReceiver(e.target.value)} style={{ fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-bg-secondary)', padding: '8px', color: 'var(--color-text-primary)', outline: 'none', width: '100%' }} placeholder="Receiver Address" />
                   )}
                </div>

                <button onClick={handleCreateCondition} style={{ width: '100%', background: '#e0ff4f', color: '#000', padding: '16px', borderRadius: '8px', border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  CREATE TRIGGER
                </button>
              </>
            ) : (
              <>
                {/* Recurring View */}
                <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Swap Frequency</div>
                <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '16px', display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
                   <select style={{ padding: '8px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '14px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', outline: 'none', flex: 1 }}>
                     <option>Every Day</option>
                     <option>Every Week</option>
                     <option>Every Month</option>
                   </select>
                </div>
                
                <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Action</div>
                <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                   <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>Buy {selectedBaseAsset} with USDC</div>
                   <input type="number" defaultValue="10" style={{ fontSize: '20px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-bg-secondary)', padding: '8px', color: 'var(--color-text-primary)', outline: 'none', width: '100%' }} placeholder="Amount of USDC" />
                </div>

                <button onClick={() => { setTradeNotif('Recurring schedule created'); setTimeout(() => setTradeNotif(''), 3000); }} style={{ width: '100%', background: '#e0ff4f', color: '#000', padding: '16px', borderRadius: '8px', border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  CREATE RECURRING
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Tabs ─────────────────────── */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--color-border)', marginBottom: '16px' }}>
           <button className={`btn btn-ghost ${activeTab === 'conditions' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('conditions')} style={{ borderRadius: 0, borderBottom: activeTab === 'conditions' ? '2px solid var(--color-text-primary)' : 'none', padding: '12px 0' }}>Conditions ({conditionsList.length})</button>
           <button className={`btn btn-ghost ${activeTab === 'trades' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('trades')} style={{ borderRadius: 0, borderBottom: activeTab === 'trades' ? '2px solid var(--color-text-primary)' : 'none', padding: '12px 0' }}>Trade History</button>
           <button className={`btn btn-ghost ${activeTab === 'payments' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('payments')} style={{ borderRadius: 0, borderBottom: activeTab === 'payments' ? '2px solid var(--color-text-primary)' : 'none', padding: '12px 0' }}>Payments</button>
           <button className={`btn btn-ghost ${activeTab === 'ai' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('ai')} style={{ borderRadius: 0, borderBottom: activeTab === 'ai' ? '2px solid var(--color-text-primary)' : 'none', padding: '12px 0' }}>AI Log</button>
           <button className={`btn btn-ghost ${activeTab === 'explorer' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('explorer')} style={{ borderRadius: 0, borderBottom: activeTab === 'explorer' ? '2px solid var(--color-success)' : 'none', padding: '12px 0', color: activeTab === 'explorer' ? 'var(--color-success)' : 'inherit' }}>Transactions</button>
        </div>

        {/* Conditions Tab */}
        {activeTab === 'conditions' && (
          <div>
            {conditionsList.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                No conditions set. Use the Workflow Agent panel to create market-aware triggers.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Condition', 'Action', 'Status', 'Created', 'Controls'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--color-border)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conditionsList.map((cond) => (
                    <tr key={cond.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                        ALGO {cond.operator === 'lt' ? '<' : '>'} ${cond.targetPrice.toFixed(4)}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                        {getActionLabel(cond.action)} {cond.amount} ALGO
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: getStatusColor(cond.status), letterSpacing: '0.06em' }}>
                          {cond.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {cond.createdAt}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {cond.status === 'met' && (
                          <button className="btn btn-primary btn-sm" onClick={() => handleExecuteCondition(cond)} disabled={executingId !== null || !activeAddress} style={{ fontSize: '10px', padding: '4px 8px', background: 'var(--color-warning)', color: '#000', border: 'none', fontWeight: 700 }}>
                            {executingId === cond.id ? 'Signing...' : 'Execute'}
                          </button>
                        )}
                        {cond.status === 'monitoring' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => { cancelCondition(cond.id); setConditionsList(getConditions()); setAgent(getAgentState()); }} style={{ fontSize: '10px', padding: '4px 8px' }}>Cancel</button>
                        )}
                        {cond.status === 'executed' && cond.executedTxId && (
                          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>{cond.executedTxId.substring(0, 10)}...</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Trades Tab */}
        {activeTab === 'trades' && (
          <div style={{ overflowX: 'auto' }}>
            {portfolio.trades.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>No trades yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Time', 'Action', 'Price', 'Amount', 'Total', 'Source'].map((h) => (<th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--color-border)', fontWeight: 500 }}>{h}</th>))}</tr></thead>
                <tbody>
                  {portfolio.trades.slice(0, 15).map((trade) => (
                    <tr key={trade.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{trade.time}</td>
                      <td style={{ padding: '8px 12px' }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700, color: trade.action === 'BUY' ? 'var(--color-success)' : 'var(--color-error)' }}>{trade.action}</span></td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>${trade.price.toFixed(4)}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{trade.amount.toFixed(2)} ALGO</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>${trade.total.toFixed(2)}</td>
                      <td style={{ padding: '8px 12px', fontSize: '10px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>{trade.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div>
            {payments.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>No payment logs yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['TX ID', 'Time', 'Status', 'Fee'].map((h) => (<th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--color-border)', fontWeight: 500 }}>{h}</th>))}</tr></thead>
                <tbody>
                  {payments.slice(0, 15).map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-accent)' }}>{p.txId}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{p.time}</td>
                      <td style={{ padding: '8px 12px' }}><span style={{ fontSize: '10px', color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>CONFIRMED</span></td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{p.fee}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* AI Tab */}
        {activeTab === 'ai' && (
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', marginBottom: '4px', textTransform: 'uppercase' }}>Mode</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 700, color: autoMode ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>{autoMode ? 'AUTONOMOUS' : 'MANUAL'}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', marginBottom: '4px', textTransform: 'uppercase' }}>Last Decision</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 700, color: aiDecision?.action === 'buy' ? 'var(--color-success)' : aiDecision?.action === 'sell' ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>{aiDecision?.action?.toUpperCase() ?? 'NONE'}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', marginBottom: '4px', textTransform: 'uppercase' }}>Memory</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{portfolio.trades.length} interaction logs</div>
              </div>
            </div>
            
            <div style={{ background: 'var(--color-bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px', fontWeight: 500 }}>LATEST AGENT OUTPUT</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: aiMessage ? 'var(--color-success)' : 'var(--color-text-tertiary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                 {aiMessage || "Waiting for next cycle..."}
                 {aiLoading && " \n\nThinking..."}
              </div>
            </div>
          </div>
        )}

        {/* Transactions / Lora Explorer Tab */}
        {activeTab === 'explorer' && (
          <div style={{ overflowX: 'auto' }}>
            {payments.length === 0 && portfolio.trades.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>No on-chain transactions yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead><tr>{['Type', 'Full TxID (Lora Copy)', 'Time'].map((h) => (<th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--color-border)', fontWeight: 500 }}>{h}</th>))}</tr></thead>
                <tbody>
                  {[...portfolio.trades.filter(t => t.id.startsWith('tx_') || t.id.length > 20).map(t => ({ id: t.id, type: `SWAP (${t.action})`, time: t.time })), ...payments.map(p => ({ id: p.txId, type: 'PAYMENT', time: p.time }))]
                    .sort((a, b) => new Date(`1970/01/01 ${b.time}`).getTime() - new Date(`1970/01/01 ${a.time}`).getTime())
                    .slice(0, 30)
                    .map((tx, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px', width: '20%' }}><span style={{ fontSize: '10px', color: tx.type === 'PAYMENT' ? 'var(--color-accent)' : 'var(--color-success)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{tx.type}</span></td>
                      <td style={{ padding: '12px', width: '60%', wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-primary)' }}>
                        {tx.id}
                        {tx.id.length > 30 && (
                          <a href={`https://lora.algonode.network/testnet/transaction/${tx.id}`} target="_blank" rel="noreferrer" style={{ marginLeft: '12px', color: 'var(--color-success)', textDecoration: 'none', fontWeight: 'bold' }}>View ↗</a>
                        )}
                      </td>
                      <td style={{ padding: '12px', width: '20%', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{tx.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────── */}
      <div style={{ marginTop: '20px', padding: '12px 16px', textAlign: 'center', fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', borderTop: '1px solid var(--color-border)' }}>
        SIMULATION MODE — Market data is real-time from Tinyman V2. Paper trades are simulated. On-chain execution requires wallet approval.
      </div>
    </div>
  );
};

export default MarketDataPanel;
