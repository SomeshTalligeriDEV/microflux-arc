// components/panels/DeploymentPanel.tsx — Deployment results + replay
import React from 'react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { useUIStore } from '../../stores/uiStore';
import { useWallet } from '@txnlab/use-wallet-react';
import { getAlgodClient, getExplorerUrl, ellipseAddress } from '../../lib/algorand';
import { compileWorkflow } from '../../lib/compiler';
import { ExternalLink, RotateCw, Loader2, CheckCircle2 } from 'lucide-react';
import algosdk from 'algosdk';
import toast from 'react-hot-toast';

const DeploymentPanel: React.FC = () => {
  const deployResult = useWorkflowStore((s) => s.lastDeploymentResult);
  const isDeploying = useUIStore((s) => s.isDeploying);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const lastCompiledTxnGroup = useWorkflowStore((s) => s.lastCompiledTxnGroup);
  const { activeAddress, wallets } = useWallet();

  const handleReplay = async () => {
    if (!activeAddress || !lastCompiledTxnGroup) return;

    useUIStore.getState().setIsDeploying(true);

    try {
      const algod = getAlgodClient();
      const compiled = await compileWorkflow(nodes, edges, algod, activeAddress);

      const peraWallet = wallets?.find((w) => w.isConnected);
      if (!peraWallet) throw new Error('No wallet connected');

      const txnsToSign = compiled.encodedTxns.map((enc) => {
        const bytes = Uint8Array.from(Buffer.from(enc, 'base64'));
        return algosdk.decodeUnsignedTransaction(bytes);
      });

      const signedTxns = await peraWallet.signTransactions(
        txnsToSign.map((t) => algosdk.encodeUnsignedTransaction(t)),
      );

      const { txId } = await algod.sendRawTransaction(signedTxns as Uint8Array[]).do();
      const result = await algosdk.waitForConfirmation(algod, txId, 4);

      useWorkflowStore.getState().setLastDeploymentResult({
        txnGroupId: txId,
        txnIds: [txId],
        timestamp: new Date().toISOString(),
        confirmedRound: Number(result.confirmedRound),
      });

      toast.success(`Replayed! Round: ${result.confirmedRound}`);
    } catch (err: any) {
      toast.error(err.message || 'Replay failed');
    } finally {
      useUIStore.getState().setIsDeploying(false);
    }
  };

  if (isDeploying) {
    return (
      <div className="empty-state">
        <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-emerald)' }} />
        <div className="empty-state-text" style={{ marginTop: 12 }}>
          Deploying to Algorand Testnet...<br />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Waiting for wallet signature</span>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!deployResult) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🚀</div>
        <div className="empty-state-text">
          No deployment yet<br />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Simulate your workflow first, then click "Deploy"
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-content animate-fade-in-up">
      {/* Success banner */}
      <div className="deploy-result">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <CheckCircle2 size={22} color="var(--accent-emerald)" />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-emerald)' }}>
              Deployment Successful
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {new Date(deployResult.timestamp).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="sim-step-row" style={{ padding: '4px 0' }}>
          <span className="sim-step-label">Transaction ID</span>
          <span className="sim-step-value" title={deployResult.txnGroupId}>
            {ellipseAddress(deployResult.txnGroupId, 8)}
          </span>
        </div>
        <div className="sim-step-row" style={{ padding: '4px 0' }}>
          <span className="sim-step-label">Confirmed Round</span>
          <span className="sim-step-value">{deployResult.confirmedRound}</span>
        </div>
        {deployResult.appId && (
          <div className="sim-step-row" style={{ padding: '4px 0' }}>
            <span className="sim-step-label">App ID</span>
            <span className="sim-step-value">{deployResult.appId}</span>
          </div>
        )}

        <div className="divider" />

        <a
          href={getExplorerUrl(deployResult.txnGroupId)}
          target="_blank"
          rel="noopener noreferrer"
          className="link"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
        >
          <ExternalLink size={14} /> View on Explorer
        </a>
      </div>

      {/* Replay button */}
      {lastCompiledTxnGroup && (
        <button
          className="btn btn-primary"
          onClick={handleReplay}
          disabled={isDeploying || !activeAddress}
          style={{ width: '100%', marginTop: 16, padding: '12px 20px', fontSize: 14 }}
        >
          <RotateCw size={16} /> Replay Workflow
        </button>
      )}
    </div>
  );
};

export default DeploymentPanel;
