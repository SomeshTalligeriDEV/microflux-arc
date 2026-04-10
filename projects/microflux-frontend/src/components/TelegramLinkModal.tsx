import React, { useState } from 'react';
import { api } from '../services/api';

interface TelegramLinkModalProps {
  openModal: boolean;
  closeModal: () => void;
  activeAddress: string | null;
  onRefreshLinkStatus: () => Promise<void>;
}

const TelegramLinkModal: React.FC<TelegramLinkModalProps> = ({
  openModal,
  closeModal,
  activeAddress,
  onRefreshLinkStatus,
}) => {
  const [loading, setLoading] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const handleGenerateCode = async () => {
    if (!activeAddress) return;

    setLoading(true);
    setError(null);
    setCopyState('idle');

    try {
      const response = await api.generateTelegramLink(activeAddress);
      setCommand(response.command);
      setStep(2);
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

  const handleDone = async () => {
    await onRefreshLinkStatus();
    closeModal();
    setCommand(null);
    setStep(1);
    setCopyState('idle');
    setError(null);
  };

  const handleClose = () => {
    if (command) {
      onRefreshLinkStatus();
    }
    closeModal();
    setCommand(null);
    setStep(1);
    setCopyState('idle');
    setError(null);
  };

  return (
    <dialog
      id="telegram_link_modal"
      className={`modal ${openModal ? 'modal-open' : ''}`}
      style={{ display: openModal ? 'flex' : 'none' }}
      onClick={handleClose}
    >
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 className="text-xl font-bold" style={{ 
            textTransform: 'uppercase', 
            letterSpacing: '0.04em',
            color: 'var(--color-text-primary)', /* Explicitly white */
            margin: 0
          }}>
            Telegram Handshake
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={handleClose} style={{ color: 'var(--color-text-secondary)' }}>✕</button>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-error)',
            fontSize: 'var(--text-xs)',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        {step === 1 ? (
          <div>
            <p style={{ 
              marginBottom: '20px', 
              lineHeight: '1.6', 
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)' 
            }}>
              Link your Telegram account to enable notifications and manage your workflows through the MicroFlux bot.
            </p>
            
            <button
              className="btn btn-primary"
              onClick={handleGenerateCode}
              disabled={!activeAddress || loading}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? 'GENERATING...' : 'GENERATE LINK CODE'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{
              padding: '10px 14px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="status-dot status-dot-success"></span>
                <span className="text-xs font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Code Generated
                </span>
              </div>
            </div>

            <div className="text-xs" style={{ 
              fontWeight: 700, 
              textTransform: 'uppercase', 
              letterSpacing: '0.06em', 
              marginBottom: '8px',
              color: 'var(--color-accent-hover)'
            }}>
              Step 1
            </div>
            <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', marginBottom: '16px' }}>
              Open Telegram and start a chat with the MicroFlux bot.
            </div>

            <div className="text-xs" style={{ 
              fontWeight: 700, 
              textTransform: 'uppercase', 
              letterSpacing: '0.06em', 
              marginBottom: '8px',
              color: 'var(--color-accent-hover)'
            }}>
              Step 2
            </div>
            <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', marginBottom: '12px' }}>
              Send this exact command to the bot:
            </div>

            <div style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-hover)',
              background: 'var(--color-bg-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '12px',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
            }}>
              <code style={{ 
                fontFamily: 'var(--font-mono)', 
                fontSize: 'var(--text-sm)', 
                wordBreak: 'break-all',
                color: 'var(--color-success)',
                fontWeight: 600
              }}>
                {command}
              </code>
              <button className="btn btn-accent btn-sm" onClick={handleCopy}>
                {copyState === 'copied' ? 'COPIED!' : 'COPY'}
              </button>
            </div>

            {copyState === 'failed' && (
              <div className="text-xs" style={{ color: 'var(--color-warning)', marginBottom: '12px' }}>
                Could not copy automatically. Please copy the command manually.
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
               <button className="btn btn-primary" onClick={handleDone} style={{ flex: 1, justifyContent: 'center' }}>
                DONE, I'VE SENT IT
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
          <button className="btn btn-ghost btn-sm" onClick={handleClose} style={{ color: 'var(--color-text-tertiary)' }}>
            CLOSE
          </button>
        </div>
      </div>
    </dialog>
  );
};

export default TelegramLinkModal;