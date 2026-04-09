// components/modals/WalletModal.tsx — Wallet connection modal
import React from 'react';
import { useWallet } from '@txnlab/use-wallet-react';
import { useUIStore } from '../../stores/uiStore';
import { X, Wallet as WalletIcon, LogOut, CheckCircle2 } from 'lucide-react';
import { ellipseAddress } from '../../lib/algorand';
import toast from 'react-hot-toast';

const WalletModal: React.FC = () => {
  const show = useUIStore((s) => s.showWalletModal);
  const setShow = useUIStore((s) => s.setShowWalletModal);
  const { wallets, activeAddress } = useWallet();

  if (!show) return null;

  const handleConnect = async (wallet: any) => {
    try {
      await wallet.connect();
      toast.success('Wallet connected!');
      setShow(false);
    } catch (err: any) {
      toast.error(err.message || 'Connection failed');
    }
  };

  const handleDisconnect = async (wallet: any) => {
    try {
      await wallet.disconnect();
      toast.success('Wallet disconnected');
    } catch (err: any) {
      toast.error(err.message || 'Disconnect failed');
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={() => setShow(false)}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="modal-title" style={{ marginBottom: 0 }}>
            <WalletIcon size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            Connect Wallet
          </div>
          <button className="btn-icon" onClick={() => setShow(false)}>
            <X size={18} />
          </button>
        </div>

        {activeAddress && (
          <div style={{
            padding: 12,
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <CheckCircle2 size={16} color="var(--accent-emerald)" />
            <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
              {ellipseAddress(activeAddress, 10)}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {wallets?.map((wallet) => (
            <div
              key={wallet.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {wallet.metadata?.icon && (
                  <img src={wallet.metadata.icon} alt={wallet.metadata.name} style={{ width: 28, height: 28, borderRadius: 6 }} />
                )}
                <span style={{ fontSize: 14, fontWeight: 500 }}>{wallet.metadata?.name || wallet.id}</span>
              </div>
              {wallet.isConnected ? (
                <button className="btn btn-danger" onClick={() => handleDisconnect(wallet)} style={{ padding: '4px 10px', fontSize: 12 }}>
                  <LogOut size={12} /> Disconnect
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => handleConnect(wallet)} style={{ padding: '4px 12px', fontSize: 12 }}>
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WalletModal;
