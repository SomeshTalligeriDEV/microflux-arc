import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid,
  ComposedChart, Bar, Cell,
} from 'recharts';
import {
  getBinancePrice, getMultiplePrices, formatChange, getTokenName,
  getKlines, getOrderBook,
  type BinancePrice, type PricePoint, type Kline, type OrderBookEntry,
} from '../services/binanceService';
import {
  getPortfolio, updatePortfolioValue, executeBuy, executeSell,
  getPaymentLogs, resetPortfolio, getAIStrategy, executeAIDecision,
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

// ── Props ────────────────────────────────────
interface MarketDataPanelProps {
  activeAddress?: string | null;
  transactionSigner?: (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>;
  networkName?: string;
}

// ── Sub-tab type ─────────────────────────────
type BottomTab = 'trades' | 'conditions' | 'payments' | 'ai';

// ── Main Component ───────────────────────────
const MarketDataPanel: React.FC<MarketDataPanelProps> = ({
  activeAddress,
  transactionSigner,
  networkName,
}) => {
  // Price State
  const [algoPrice, setAlgoPrice] = useState<BinancePrice | null>(null);
  const [otherPrices, setOtherPrices] = useState<BinancePrice[]>([]);
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
  const [rightPanel, setRightPanel] = useState<'trade' | 'agent'>('agent');
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch Prices & Evaluate Conditions ───
  const fetchPrices = useCallback(async () => {
    try {
      const [algo, others] = await Promise.all([
        getBinancePrice('ALGO'),
        getMultiplePrices(['BTC', 'ETH', 'SOL']),
      ]);
      setAlgoPrice(algo);
      setOtherPrices(others);
      setLastUpdate(new Date().toLocaleTimeString());

      setPriceHistory(prev => {
        const next = [...prev, {
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          price: algo.price,
          timestamp: Date.now(),
        }];
        return next.slice(-60);
      });

      const updated = updatePortfolioValue(algo.price);
      setPortfolio(updated);

      // Evaluate conditions against live price
      const newlyMet = evaluateConditions(algo.price);
      if (newlyMet.length > 0) {
        setTradeNotif(`Condition triggered: ${formatCondition(newlyMet[0])}`);
        setTimeout(() => setTradeNotif(''), 5000);
      }
      setConditionsList(getConditions());
      setAgent(getAgentState());
    } catch (err) {
      console.error('[Market] Price fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch Klines + Order Book ─────────────
  const fetchChartData = useCallback(async () => {
    try {
      const [klinesData, bookData] = await Promise.all([
        getKlines('ALGO', chartInterval, 80),
        getOrderBook('ALGO', 12),
      ]);
      setKlines(klinesData);
      setOrderBook(bookData);
    } catch (err) {
      console.error('[Market] Chart data error:', err);
    }
  }, [chartInterval]);

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
    setTradeNotif(`Condition created: ${condAction === 'send_payment' ? 'Send' : condAction === 'sell_algo' ? 'Sell' : condAction === 'buy_algo' ? 'Buy' : 'Execute'} ${amount} ALGO when price ${condOperator === 'lt' ? '<' : '>'} $${price.toFixed(4)}`);
    setTimeout(() => setTradeNotif(''), 3000);
  }, [condOperator, condPrice, condAction, condAmount, condReceiver]);

  // ── Execute On-Chain ─────────────────────
  const handleExecuteCondition = useCallback(async (cond: MarketCondition) => {
    if (!activeAddress || !transactionSigner || !algoPrice) {
      setExecMessage('Connect your wallet to execute on-chain.');
      return;
    }

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

      const encodedTxn = txn.toByte();
      const signedTxns = await transactionSigner(
        [txn],
        [0]
      );

      setExecMessage('Submitting to Algorand Testnet...');

      await algod.sendRawTransaction(signedTxns[0]).do();
      const txId = txn.txID();

      await algosdk.waitForConfirmation(algod, txId, 4);

      markExecuted(cond.id, txId);
      setConditionsList(getConditions());
      setAgent(getAgentState());
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
      setExecutingId(null);
    }
  }, [activeAddress, transactionSigner, algoPrice]);

  // ── Manual Paper Trade ───────────────────
  const handleTrade = useCallback(() => {
    if (!algoPrice) return;
    const amount = parseFloat(tradeAmount);
    if (isNaN(amount) || amount <= 0) return;
    const result = tradeAction === 'BUY'
      ? executeBuy(algoPrice.price, amount)
      : executeSell(algoPrice.price, amount);
    if (result.success && result.trade) {
      setTradeNotif(`${result.trade.action}: ${result.trade.amount.toFixed(2)} ALGO at $${result.trade.price.toFixed(4)}`);
      setTimeout(() => setTradeNotif(''), 3000);
    } else {
      setTradeNotif(result.error ?? 'Trade failed');
      setTimeout(() => setTradeNotif(''), 3000);
    }
    setPortfolio(getPortfolio());
    setPayments(getPaymentLogs());
  }, [algoPrice, tradeAmount, tradeAction]);

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
          <p className="page-subtitle">Connecting to Binance...</p>
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
            Real-time Binance data &middot; Conditional Workflows &middot; On-chain Execution
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
        {/* Left: Professional Chart + Order Book */}
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          {/* Chart Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px' }}>ALGO/USDT</div>
                {algoPrice && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>${algoPrice.price.toFixed(4)}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: algoPrice.changePercent24h >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {formatChange(algoPrice.changePercent24h).text}
                    </span>
                  </div>
                )}
              </div>
              {/* OHLC from latest kline */}
              {klines.length > 0 && (
                <div style={{ display: 'flex', gap: '12px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                  <span>O <span style={{ color: 'var(--color-text-secondary)' }}>{klines[klines.length - 1].open.toFixed(5)}</span></span>
                  <span>H <span style={{ color: 'var(--color-success)' }}>{klines[klines.length - 1].high.toFixed(5)}</span></span>
                  <span>L <span style={{ color: 'var(--color-error)' }}>{klines[klines.length - 1].low.toFixed(5)}</span></span>
                  <span>C <span style={{ color: klines[klines.length - 1].close >= klines[klines.length - 1].open ? 'var(--color-success)' : 'var(--color-error)' }}>{klines[klines.length - 1].close.toFixed(5)}</span></span>
                </div>
              )}
            </div>
            {/* Interval Selector */}
            <div style={{ display: 'flex', gap: '2px' }}>
              {['5m', '15m', '1h', '4h', '1d'].map((iv) => (
                <button key={iv} onClick={() => setChartInterval(iv)} style={{
                  padding: '4px 8px', border: 'none', fontSize: '10px',
                  fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
                  background: chartInterval === iv ? 'var(--color-accent)' : 'transparent',
                  color: chartInterval === iv ? '#fff' : 'var(--color-text-tertiary)',
                  letterSpacing: '0.04em',
                }}>{iv}</button>
              ))}
            </div>
          </div>

          {/* Main Chart Area with OHLCV */}
          <div style={{ display: 'flex' }}>
            {/* Chart */}
            <div style={{ flex: 1, padding: '8px 0 0 0' }}>
              <div style={{ width: '100%', height: 220 }}>
                {klines.length > 0 ? (
                  <ResponsiveContainer>
                    <ComposedChart data={klines} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="klineGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#26a69a" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#26a69a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 9, fill: '#555', fontFamily: 'JetBrains Mono, monospace' }}
                        axisLine={{ stroke: '#222' }}
                        tickLine={false}
                        interval={Math.max(Math.floor(klines.length / 6), 1)}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 10, fill: '#555', fontFamily: 'JetBrains Mono, monospace' }}
                        axisLine={{ stroke: '#222' }}
                        tickLine={false}
                        width={65}
                        tickFormatter={(v: number) => v.toFixed(4)}
                        orientation="right"
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '2px', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', padding: '8px 12px' }}
                        labelStyle={{ color: '#888', marginBottom: '4px' }}
                        formatter={(value: unknown, name: any) => {
                          const v = Number(value);
                          if (name === 'volume') return [`${(v / 1000).toFixed(1)}K`, 'Vol'];
                          return [`$${v.toFixed(5)}`, name.charAt(0).toUpperCase() + name.slice(1)];
                        }}
                      />
                      <Area type="monotone" dataKey="close" stroke="#26a69a" strokeWidth={1.5} fill="url(#klineGrad)" dot={false} animationDuration={500} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                    Loading chart data...
                  </div>
                )}
              </div>

              {/* Volume Bars */}
              {klines.length > 0 && (
                <div style={{ width: '100%', height: 60 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={klines} margin={{ top: 0, right: 10, left: 0, bottom: 5 }}>
                      <XAxis dataKey="time" tick={false} axisLine={{ stroke: '#222' }} tickLine={false} />
                      <YAxis tick={false} axisLine={false} tickLine={false} width={65} orientation="right" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '2px', fontSize: '10px', fontFamily: 'JetBrains Mono, monospace' }}
                        formatter={(value: unknown) => [`${(Number(value) / 1000).toFixed(1)}K`, 'Volume']}
                      />
                      <Bar dataKey="volume" animationDuration={300}>
                        {klines.map((entry, index) => (
                          <Cell key={`vol-${index}`} fill={entry.close >= entry.open ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)'} />
                        ))}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Order Book */}
            <div style={{ width: '150px', borderLeft: '1px solid #1a1a1a', padding: '8px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--color-text-tertiary)', letterSpacing: '0.06em' }}>
                <span>Price</span><span>Size</span>
              </div>
              {/* Asks (sell orders) - reversed for display */}
              {orderBook.asks.slice(0, 8).reverse().map((ask, i) => (
                <div key={`ask-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', position: 'relative' }}>
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${Math.min((ask.size / (orderBook.asks[orderBook.asks.length-1]?.total || 1)) * 100, 100)}%`, background: 'rgba(239, 83, 80, 0.08)' }} />
                  <span style={{ color: '#ef5350', position: 'relative', zIndex: 1 }}>{ask.price.toFixed(5)}</span>
                  <span style={{ color: '#888', position: 'relative', zIndex: 1 }}>{ask.size.toFixed(0)}</span>
                </div>
              ))}
              {/* Spread */}
              {algoPrice && (
                <div style={{ padding: '4px 0', borderTop: '1px solid #222', borderBottom: '1px solid #222', margin: '4px 0', textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 700, fontSize: '11px' }}>
                  ${algoPrice.price.toFixed(5)}
                </div>
              )}
              {/* Bids (buy orders) */}
              {orderBook.bids.slice(0, 8).map((bid, i) => (
                <div key={`bid-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', position: 'relative' }}>
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${Math.min((bid.size / (orderBook.bids[orderBook.bids.length-1]?.total || 1)) * 100, 100)}%`, background: 'rgba(38, 166, 154, 0.08)' }} />
                  <span style={{ color: '#26a69a', position: 'relative', zIndex: 1 }}>{bid.price.toFixed(5)}</span>
                  <span style={{ color: '#888', position: 'relative', zIndex: 1 }}>{bid.size.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 24h Stats Bar */}
          {algoPrice && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', padding: '12px 20px', borderTop: '1px solid #1a1a1a', background: 'rgba(0,0,0,0.2)' }}>
              {[
                { label: '24h High', value: `$${algoPrice.high24h.toFixed(4)}` },
                { label: '24h Low', value: `$${algoPrice.low24h.toFixed(4)}` },
                { label: '24h Volume', value: `${(algoPrice.volume24h / 1e6).toFixed(1)}M` },
                { label: '24h Change', value: `$${algoPrice.change24h.toFixed(4)}`, color: algoPrice.change24h >= 0 ? '#26a69a' : '#ef5350' },
                { label: 'Spread', value: orderBook.asks[0] && orderBook.bids[0] ? `$${(orderBook.asks[0].price - orderBook.bids[0].price).toFixed(5)}` : '—' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontSize: '9px', color: '#555', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: color ?? 'var(--color-text-primary)' }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Panel: Toggle between Agent/Trade */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Panel Switcher */}
          <div style={{ display: 'flex', gap: '0' }}>
            <button onClick={() => setRightPanel('agent')} style={{ flex: 1, padding: '8px', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', background: rightPanel === 'agent' ? 'var(--color-accent)' : 'var(--color-bg-tertiary)', color: rightPanel === 'agent' ? '#fff' : 'var(--color-text-secondary)' }}>
              WORKFLOW AGENT
            </button>
            <button onClick={() => setRightPanel('trade')} style={{ flex: 1, padding: '8px', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', background: rightPanel === 'trade' ? 'var(--color-accent)' : 'var(--color-bg-tertiary)', color: rightPanel === 'trade' ? '#fff' : 'var(--color-text-secondary)' }}>
              PAPER TRADE
            </button>
          </div>

          {rightPanel === 'agent' ? (
            <>
              {/* Agent Status */}
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: agentStatusColor, display: 'inline-block', animation: agent.status === 'monitoring' ? 'pulse 2s infinite' : 'none' }} />
                  <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: agentStatusColor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Agent: {agent.status === 'condition_met' ? 'Action Required' : agent.status === 'monitoring' ? 'Monitoring' : 'Standby'}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.5, marginBottom: '8px' }}>
                  {agent.message}
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                  <span>Active: {agent.activeConditions}</span>
                  <span>Triggered: {agent.metConditions}</span>
                  {agent.lastCheck && <span>Last: {agent.lastCheck}</span>}
                </div>
              </div>

              {/* Condition Builder */}
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Create Condition
                </div>

                {/* Action Select */}
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '4px', letterSpacing: '0.06em' }}>ACTION</label>
                  <select className="input" value={condAction} onChange={(e) => setCondAction(e.target.value as ConditionAction)} style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                    <option value="send_payment">Send Payment</option>
                    <option value="sell_algo">Sell ALGO</option>
                    <option value="buy_algo">Buy ALGO</option>
                    <option value="app_call">Execute Workflow</option>
                  </select>
                </div>

                {/* Condition Row */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <div style={{ flex: '0 0 auto' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>WHEN</label>
                    <select className="input" value={condOperator} onChange={(e) => setCondOperator(e.target.value as ConditionOperator)} style={{ width: '60px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                      <option value="lt">&lt;</option>
                      <option value="gt">&gt;</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>PRICE (USD)</label>
                    <input type="number" className="input" value={condPrice} onChange={(e) => setCondPrice(e.target.value)} min="0" step="0.01" style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>AMOUNT</label>
                    <input type="number" className="input" value={condAmount} onChange={(e) => setCondAmount(e.target.value)} min="0" step="1" style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }} />
                  </div>
                </div>

                {/* Receiver (optional) */}
                {(condAction === 'send_payment') && (
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>RECEIVER ADDRESS</label>
                    <input type="text" className="input" value={condReceiver} onChange={(e) => setCondReceiver(e.target.value)} placeholder="ALGO address (optional)" style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '10px' }} />
                  </div>
                )}

                {/* Preview */}
                {algoPrice && (
                  <div style={{ padding: '8px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', marginBottom: '10px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                    <div>Current: ${algoPrice.price.toFixed(4)}</div>
                    <div>Trigger: ALGO {condOperator === 'lt' ? '<' : '>'} ${parseFloat(condPrice || '0').toFixed(4)}</div>
                    <div>Value: ~${(parseFloat(condAmount || '0') * algoPrice.price).toFixed(2)} USD</div>
                    <div style={{ color: (condOperator === 'lt' && algoPrice.price < parseFloat(condPrice || '0')) || (condOperator === 'gt' && algoPrice.price > parseFloat(condPrice || '0')) ? 'var(--color-warning)' : 'var(--color-text-muted)', marginTop: '4px', fontWeight: 700 }}>
                      Status: {(condOperator === 'lt' && algoPrice.price < parseFloat(condPrice || '0')) || (condOperator === 'gt' && algoPrice.price > parseFloat(condPrice || '0')) ? 'WOULD TRIGGER NOW' : 'Not met yet'}
                    </div>
                  </div>
                )}

                <button className="btn btn-primary" onClick={handleCreateCondition} style={{ width: '100%', fontWeight: 700 }}>
                  Create Condition
                </button>
              </div>

              {/* AI Agent (compact) */}
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>AI Strategy</div>
                <input type="password" className="input" value={groqKey} onChange={(e) => setGroqKey(e.target.value)} placeholder="Groq API Key" style={{ width: '100%', marginBottom: '6px', fontFamily: 'var(--font-mono)', fontSize: '10px' }} />
                <button className="btn btn-primary btn-sm" onClick={runAIStrategy} disabled={aiLoading || !groqKey} style={{ width: '100%', marginBottom: '6px' }}>
                  {aiLoading ? 'Analyzing...' : 'Run AI Strategy'}
                </button>
                {aiMessage && <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>{aiMessage}</div>}
              </div>
            </>
          ) : (
            <>
              {/* Portfolio */}
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>Portfolio</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: '4px' }}>${portfolio.totalValue.toFixed(2)}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: pnlColor, marginBottom: '16px' }}>{pnlSign}${portfolio.pnl.toFixed(2)} ({pnlSign}{portfolio.pnlPercent.toFixed(2)}%)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { label: 'Cash', value: `$${portfolio.cash.toFixed(2)}` },
                    { label: 'ALGO Holdings', value: portfolio.algo.toFixed(2) },
                    { label: 'ALGO Value', value: `$${(portfolio.algo * (algoPrice?.price ?? 0)).toFixed(2)}` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trade Panel */}
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>Place Trade</div>
                <div style={{ display: 'flex', gap: '0', marginBottom: '12px' }}>
                  <button onClick={() => setTradeAction('BUY')} style={{ flex: 1, padding: '8px', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', background: tradeAction === 'BUY' ? 'var(--color-success)' : 'var(--color-bg-tertiary)', color: tradeAction === 'BUY' ? '#000' : 'var(--color-text-secondary)' }}>BUY</button>
                  <button onClick={() => setTradeAction('SELL')} style={{ flex: 1, padding: '8px', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', background: tradeAction === 'SELL' ? 'var(--color-error)' : 'var(--color-bg-tertiary)', color: tradeAction === 'SELL' ? '#fff' : 'var(--color-text-secondary)' }}>SELL</button>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>{tradeAction === 'BUY' ? 'AMOUNT (USD)' : 'AMOUNT (ALGO)'}</label>
                  <input type="number" className="input" value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)} min="0" step="10" style={{ width: '100%', fontFamily: 'var(--font-mono)' }} />
                </div>
                {algoPrice && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: '12px' }}>
                    {tradeAction === 'BUY' ? `Est: ${(parseFloat(tradeAmount || '0') / algoPrice.price).toFixed(2)} ALGO` : `Est: $${(parseFloat(tradeAmount || '0') * algoPrice.price).toFixed(2)}`}
                  </div>
                )}
                <button className="btn btn-primary" onClick={handleTrade} style={{ width: '100%', background: tradeAction === 'BUY' ? 'var(--color-success)' : 'var(--color-error)', color: tradeAction === 'BUY' ? '#000' : '#fff', border: 'none', fontWeight: 700 }}>
                  {tradeAction === 'BUY' ? 'Buy ALGO' : 'Sell ALGO'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleReset} style={{ width: '100%', marginTop: '8px', fontSize: 'var(--text-xs)' }}>Reset All</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Bottom Tabs ─────────────────────── */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', marginBottom: '16px' }}>
          {(['conditions', 'trades', 'payments', 'ai'] as BottomTab[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '8px 20px', border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--color-accent)' : '2px solid transparent',
              background: 'none', color: activeTab === tab ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: activeTab === tab ? 700 : 400,
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            }}>
              {tab === 'conditions' ? `Conditions (${conditionsList.filter(c => c.status === 'monitoring' || c.status === 'met').length})` : tab === 'trades' ? 'Trade History' : tab === 'payments' ? 'Payments' : 'AI Log'}
            </button>
          ))}
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
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', marginBottom: '4px', textTransform: 'uppercase' }}>AI Trades</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>{portfolio.trades.filter(t => t.source === 'ai').length}</div>
              </div>
            </div>
            {aiDecision && (
              <div style={{ padding: '12px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Latest Reasoning</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>{aiDecision.reason}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────── */}
      <div style={{ marginTop: '20px', padding: '12px 16px', textAlign: 'center', fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', borderTop: '1px solid var(--color-border)' }}>
        SIMULATION MODE — Market data is real-time from Binance. Paper trades are simulated. On-chain execution requires wallet approval.
      </div>
    </div>
  );
};

export default MarketDataPanel;
