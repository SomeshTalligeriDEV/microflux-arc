// components/layout/StatusBar.tsx — Bottom status bar
import React, { useState, useEffect } from 'react';
import { useWallet } from '@txnlab/use-wallet-react';
import { getAlgodClient, getNetworkName, microAlgosToAlgos } from '../../lib/algorand';
import { useWorkflowStore } from '../../stores/workflowStore';

const StatusBar: React.FC = () => {
  const { activeAddress } = useWallet();
  const nodeCount = useWorkflowStore((s) => s.nodes.length);
  const edgeCount = useWorkflowStore((s) => s.edges.length);
  const [balance, setBalance] = useState<string>('—');
  const network = getNetworkName();

  useEffect(() => {
    if (!activeAddress) {
      setBalance('—');
      return;
    }

    let cancelled = false;

    const fetchBalance = async () => {
      try {
        const algod = getAlgodClient();
        const info = await algod.accountInformation(activeAddress).do();
        if (!cancelled) {
          setBalance(microAlgosToAlgos(Number(info.amount)));
        }
      } catch {
        if (!cancelled) setBalance('Error');
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeAddress]);

  return (
    <div className="app-statusbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="status-dot online" />
          <span>Network: <strong style={{ color: 'var(--text-primary)' }}>{network}</strong></span>
        </div>
        <span>Nodes: <strong style={{ color: 'var(--text-primary)' }}>{nodeCount}</strong></span>
        <span>Edges: <strong style={{ color: 'var(--text-primary)' }}>{edgeCount}</strong></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {activeAddress && (
          <span>Balance: <strong style={{ color: 'var(--accent-emerald)' }}>{balance} ALGO</strong></span>
        )}
        <span style={{ color: 'var(--text-muted)' }}>Microflux-X1 v0.1</span>
      </div>
    </div>
  );
};

export default StatusBar;
