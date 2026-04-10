import React, { useMemo, useState } from 'react';
import { api } from '../services/api';

interface TelegramLinkPanelProps {
  activeAddress: string | null;
  isLinked: boolean;
  onRefreshLinkStatus: () => Promise<void>;
}

const TelegramLinkPanel: React.FC<TelegramLinkPanelProps> = ({
  activeAddress,
  isLinked,
  onRefreshLinkStatus,
}) => {
  const [loading, setLoading] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState<string | null>(null);

  const canLink = Boolean(activeAddress);

  const statusText = useMemo(() => {
    if (!activeAddress) return 'Connect your wallet to link Telegram.';
    if (isLinked) return 'Telegram is linked for this wallet.';
    return 'Telegram is not linked yet for this wallet.';
  }, [activeAddress, isLinked]);

  const handleGenerateCode = async () => {
    if (!activeAddress) return;

    setLoading(true);
    setError(null);
    setCopyState('idle');

    try {
      const response = await api.generateTelegramLink(activeAddress);
      setCommand(response.command);
      await onRefreshLinkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate link code');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!command) return;

    try {
      await navigator.clipboard.writeText(command);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="card" style={{ marginTop: '16px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <div className="text-sm font-bold">Telegram Handshake</div>
          <div className="text-xs text-muted" style={{ marginTop: '4px' }}>{statusText}</div>
        </div>

        <button
          className="btn btn-sm btn-primary"
          onClick={handleGenerateCode}
          disabled={!canLink || loading}
          title={!canLink ? 'Connect wallet first' : 'Generate one-time code'}
        >
          {loading ? 'GENERATING...' : 'LINK TELEGRAM'}
        </button>
      </div>

      {error && (
        <div style={{
          marginTop: '12px',
          padding: '10px 12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(239,68,68,0.3)',
          background: 'rgba(239,68,68,0.1)',
          color: 'var(--color-error)',
          fontSize: 'var(--text-xs)',
        }}>
          {error}
        </div>
      )}

      {command && (
        <div style={{ marginTop: '14px' }}>
          <div className="text-xs" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Step 1
          </div>
          <div className="text-sm text-muted" style={{ marginTop: '4px' }}>
            Open Telegram and chat with the MicroFlux bot.
          </div>

          <div className="text-xs" style={{ marginTop: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Step 2
          </div>
          <div className="text-sm text-muted" style={{ marginTop: '4px' }}>
            Send this exact command:
          </div>

          <div style={{
            marginTop: '8px',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-input)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{command}</code>
            <button className="btn btn-outline btn-sm" onClick={handleCopy}>COPY</button>
          </div>

          {copyState === 'copied' && (
            <div className="text-xs" style={{ color: 'var(--color-success)', marginTop: '6px' }}>
              Copied to clipboard.
            </div>
          )}
          {copyState === 'failed' && (
            <div className="text-xs" style={{ color: 'var(--color-warning)', marginTop: '6px' }}>
              Could not copy automatically. Copy the command manually.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TelegramLinkPanel;
