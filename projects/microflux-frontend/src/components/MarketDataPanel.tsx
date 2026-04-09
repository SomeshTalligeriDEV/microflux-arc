import React, { useState, useEffect } from 'react';
import { getAlgoPrice, getTokenPrices, formatPriceChange, type TokenPrice } from '../services/marketService';

const MarketDataPanel: React.FC = () => {
  const [algoPrice, setAlgoPrice] = useState<TokenPrice | null>(null);
  const [otherPrices, setOtherPrices] = useState<TokenPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchPrices = async () => {
    try {
      const [algo, others] = await Promise.all([
        getAlgoPrice(),
        getTokenPrices(['BTC', 'ETH', 'USDC']),
      ]);
      setAlgoPrice(algo);
      setOtherPrices(others);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to fetch prices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 45000); // Refresh every 45s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">MARKET DATA</h1>
          <p className="page-subtitle">Loading market data...</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: '120px' }}></div>
          ))}
        </div>
      </div>
    );
  }

  const allPrices = algoPrice ? [algoPrice, ...otherPrices] : otherPrices;

  return (
    <div className="page-container animate-fadeIn">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">MARKET DATA</h1>
          <p className="page-subtitle">
            Real-time token prices powered by CoinGecko
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="text-xs text-muted">Updated: {lastUpdate}</span>
          <button className="btn btn-ghost btn-sm" onClick={fetchPrices}>
            ↻ REFRESH
          </button>
        </div>
      </div>

      {/* ALGO Featured Card */}
      {algoPrice && (
        <div className="card" style={{
          marginBottom: '24px',
          background: 'linear-gradient(135deg, var(--color-bg-card) 0%, rgba(37, 99, 235, 0.05) 100%)',
          borderColor: 'var(--color-border-accent)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ fontSize: '2rem' }}>◆</span>
                <div>
                  <div className="text-sm font-bold text-uppercase" style={{ letterSpacing: '0.06em' }}>
                    {algoPrice.name}
                  </div>
                  <div className="text-xs text-muted">{algoPrice.symbol}</div>
                </div>
              </div>
              <div className="price-display">
                <span className="price-value" style={{ fontSize: 'var(--text-3xl)' }}>
                  ${algoPrice.current_price.toFixed(4)}
                </span>
                {(() => {
                  const change = formatPriceChange(algoPrice.price_change_percentage_24h);
                  return (
                    <span className={`price-change price-${change.direction}`}>
                      {change.text}
                    </span>
                  );
                })()}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="text-xs text-muted" style={{ marginBottom: '4px' }}>24h Change</div>
              <div className="text-mono text-sm" style={{
                color: algoPrice.price_change_24h >= 0 ? 'var(--color-success)' : 'var(--color-error)',
              }}>
                {algoPrice.price_change_24h >= 0 ? '+' : ''}${algoPrice.price_change_24h.toFixed(6)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other Tokens */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
        {otherPrices.map((token) => {
          const change = formatPriceChange(token.price_change_percentage_24h);
          return (
            <div key={token.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div className="text-sm font-bold">{token.symbol}</div>
                <span className={`price-change price-${change.direction}`} style={{ fontSize: 'var(--text-xs)' }}>
                  {change.text}
                </span>
              </div>
              <div className="price-value">${token.current_price.toLocaleString()}</div>
              <div className="text-xs text-muted" style={{ marginTop: '4px' }}>{token.name}</div>
            </div>
          );
        })}
      </div>

      {/* Quote Calculator */}
      <div className="card" style={{ marginTop: '24px' }}>
        <h3 className="text-lg" style={{ marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Transaction Value Calculator
        </h3>
        <QuoteCalculator algoPrice={algoPrice?.current_price ?? 0.24} />
      </div>
    </div>
  );
};

// ── Quote Calculator ─────────────────────────

const QuoteCalculator: React.FC<{ algoPrice: number }> = ({ algoPrice }) => {
  const [amount, setAmount] = useState('1');

  const numericAmount = parseFloat(amount) || 0;
  const usdValue = numericAmount * algoPrice;

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
        <input
          type="number"
          className="input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ maxWidth: '200px' }}
          min="0"
          step="0.1"
        />
        <span className="text-sm font-bold">ALGO</span>
        <span className="text-sm text-muted">=</span>
        <span className="price-value">${usdValue.toFixed(4)}</span>
        <span className="text-sm text-muted">USD</span>
      </div>

      <div className="sim-panel">
        <div className="sim-row">
          <span className="sim-label">Amount</span>
          <span className="sim-value">{numericAmount} ALGO</span>
        </div>
        <div className="sim-row">
          <span className="sim-label">Price per ALGO</span>
          <span className="sim-value">${algoPrice.toFixed(4)}</span>
        </div>
        <div className="sim-row">
          <span className="sim-label">Total Value</span>
          <span className="sim-value">${usdValue.toFixed(4)}</span>
        </div>
        <div className="sim-row">
          <span className="sim-label">Display</span>
          <span className="sim-value" style={{ color: 'var(--color-accent)' }}>
            Send {numericAmount} ALGO (~${usdValue.toFixed(2)})
          </span>
        </div>
      </div>
    </div>
  );
};

export default MarketDataPanel;
