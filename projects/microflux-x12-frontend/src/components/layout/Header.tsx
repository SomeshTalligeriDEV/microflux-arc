// components/layout/Header.tsx — Minimalist Top Bar
import React from 'react';
import { useWallet } from '@txnlab/use-wallet-react';
import { Wallet, ChevronRight } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { ellipseAddress } from '../../lib/algorand';

const Header: React.FC = () => {
  const { activeAddress } = useWallet();
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const setWorkflowName = useWorkflowStore((s) => s.setWorkflowName);
  const { setShowWalletModal, setView } = useUIStore();

  return (
    <header className="app-header-minimal">
      <div className="header-left">
        <button className="back-to-landing" onClick={() => setView('landing')}>
          ⬡
        </button>
        <div className="breadcrumb">
          <span className="breadcrumb-root">Workflows</span>
          <ChevronRight size={14} className="breadcrumb-sep" />
          <input
            className="header-workflow-name"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            placeholder="Untitled workflow"
          />
        </div>
      </div>

      <div className="header-right">
        <div className="network-indicator">
          <span className="dot" />
          Testnet
        </div>
        
        <button 
          className={`wallet-pill ${activeAddress ? 'connected' : ''}`} 
          onClick={() => setShowWalletModal(true)}
        >
          <Wallet size={14} />
          {activeAddress ? ellipseAddress(activeAddress) : 'Connect'}
        </button>
      </div>

      <style>{`
        .app-header-minimal {
          grid-column: 2 / 4;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 24px;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-subtle);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .back-to-landing {
          background: transparent;
          border: none;
          color: #fff;
          font-size: 20px;
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 0.2s;
        }
        .back-to-landing:hover { opacity: 1; }
        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        .breadcrumb-root {
          color: var(--text-muted);
          font-weight: 500;
        }
        .breadcrumb-sep {
          color: var(--text-muted);
          opacity: 0.5;
        }
        .header-workflow-name {
          background: transparent;
          border: none;
          color: #fff;
          font-weight: 600;
          outline: none;
          width: 200px;
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .network-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          background: rgba(255,255,255,0.03);
          padding: 4px 10px;
          border-radius: 6px;
        }
        .network-indicator .dot {
          width: 6px;
          height: 6px;
          background: #3b82f6;
          border-radius: 50%;
        }
        .wallet-pill {
          background: #fff;
          color: #000;
          border: none;
          padding: 6px 14px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .wallet-pill:hover { background: #f1f5f9; }
        .wallet-pill.connected {
          background: rgba(255,255,255,0.05);
          color: #fff;
          border: 1px solid var(--border-subtle);
        }
      `}</style>
    </header>
  );
};

export default Header;
