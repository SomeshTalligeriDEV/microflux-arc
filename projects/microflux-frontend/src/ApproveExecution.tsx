import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@txnlab/use-wallet-react';
import algosdk from 'algosdk';
import { api, type PendingExecutionDetails } from './services/api';
import { getAlgodConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs';
import { normalizeAmountToMicroAlgos } from './utils/amount';

interface ApproveExecutionProps {
  token: string;
}

const ApproveExecution: React.FC<ApproveExecutionProps> = ({ token }) => {
  const { activeAddress, transactionSigner, wallets } = useWallet();
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [execution, setExecution] = useState<PendingExecutionDetails | null>(null);
  const [successTxId, setSuccessTxId] = useState<string | null>(null);

  const pendingPayment = useMemo(() => {
    if (!execution) return null;

    const paymentNode = (Array.isArray(execution.nodes) ? execution.nodes : []).find((node) => {
      const nodeType = String(node?.type ?? '').toLowerCase();
      return nodeType === 'send_payment' || nodeType.includes('payment');
    });

    if (!paymentNode) return null;

    const nodeConfig = paymentNode?.config && typeof paymentNode.config === 'object' ? paymentNode.config : {};
    const nodeDataConfig = paymentNode?.data?.config && typeof paymentNode.data.config === 'object'
      ? paymentNode.data.config
      : {};
    const params = execution.params && typeof execution.params === 'object' ? execution.params : {};

    const receiver = String(
      (params as any).receiver ??
      (nodeConfig as any).receiver ??
      (nodeDataConfig as any).receiver ??
      '',
    ).trim();
    const rawAmount =
      (params as any).amount ??
      (nodeConfig as any).amount ??
      (nodeDataConfig as any).amount ??
      0;
    const unitHint =
      (params as any).amountUnit ??
      (params as any).unit ??
      (nodeConfig as any).amountUnit ??
      (nodeConfig as any).unit ??
      (nodeDataConfig as any).amountUnit ??
      (nodeDataConfig as any).unit;
    const amount = normalizeAmountToMicroAlgos(rawAmount, unitHint);

    return { receiver, amount };
  }, [execution]);

  useEffect(() => {
    let cancelled = false;

    const loadExecution = async () => {
      setLoading(true);
      setError(null);

      try {
        const details = await api.getPendingExecution(token);
        if (!cancelled) {
          setExecution(details);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load execution request');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadExecution();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSignWithPera = useCallback(async () => {
    if (!execution) return;

    if (!activeAddress || !transactionSigner) {
      setError('Connect your Pera wallet before signing.');
      return;
    }

    if (!pendingPayment) {
      setError('This workflow has no signable send_payment node.');
      return;
    }

    if (!pendingPayment.receiver || !algosdk.isValidAddress(pendingPayment.receiver)) {
      setError('Execution payload has an invalid receiver address.');
      return;
    }

    if (!Number.isFinite(pendingPayment.amount) || pendingPayment.amount <= 0) {
      setError('Execution payload has an invalid amount.');
      return;
    }

    setSigning(true);
    setError(null);

    try {
      const cfg = getAlgodConfigFromViteEnvironment();
      const serverUrl = cfg.port ? `${cfg.server}:${cfg.port}` : cfg.server;
      const algodClient = new algosdk.Algodv2(String(cfg.token || ''), serverUrl, '');

      const suggestedParams = await algodClient.getTransactionParams().do();
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: pendingPayment.receiver,
        amount: Math.trunc(pendingPayment.amount),
        suggestedParams,
      });

      const signed = await transactionSigner([txn], [0]);
      await algodClient.sendRawTransaction(signed[0]).do();
      const txId = txn.txID();
      await algosdk.waitForConfirmation(algodClient, txId, 4);

      await api.confirmExecution(token, txId);
      setSuccessTxId(txId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
    } finally {
      setSigning(false);
    }
  }, [activeAddress, execution, pendingPayment, token, transactionSigner]);

  return (
    <div className="page-container animate-fadeIn" style={{ maxWidth: '760px', paddingTop: '48px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <h1 className="page-title" style={{ fontSize: '1.8rem' }}>Approve Execution</h1>

        {loading && <div className="text-sm text-muted">Loading execution request...</div>}

        {!loading && error && (
          <div style={{
            marginTop: '12px',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.1)',
            color: 'var(--color-error)',
            fontSize: 'var(--text-sm)',
          }}>
            {error}
          </div>
        )}

        {!loading && execution && (
          <>
            <p className="text-sm" style={{ marginTop: '8px' }}>
              You are about to execute <strong>{execution.workflowName}</strong>.
            </p>

            <div className="sim-panel" style={{ marginTop: '14px' }}>
              <div className="sim-row">
                <span className="sim-label">Workflow ID</span>
                <span className="sim-value" style={{ fontSize: '0.72rem' }}>{execution.workflowId}</span>
              </div>
              <div className="sim-row">
                <span className="sim-label">Receiver</span>
                <span className="sim-value" style={{ fontSize: '0.72rem' }}>{pendingPayment?.receiver || 'N/A'}</span>
              </div>
              <div className="sim-row">
                <span className="sim-label">Amount (microAlgos)</span>
                <span className="sim-value">{pendingPayment?.amount ?? 'N/A'}</span>
              </div>
            </div>

            {!activeAddress && (
              <div style={{ marginTop: '14px' }}>
                <div className="text-sm text-muted" style={{ marginBottom: '8px' }}>Connect your wallet to continue:</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(wallets || []).map((wallet) => (
                    <button
                      key={wallet.id}
                      className="btn btn-outline btn-sm"
                      onClick={() => wallet.connect()}
                    >
                      Connect {wallet.metadata.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {successTxId ? (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(34,197,94,0.3)',
                background: 'rgba(34,197,94,0.1)',
                color: 'var(--color-success)',
                fontSize: 'var(--text-sm)',
              }}>
                Signed and sent successfully. Telegram has been notified. Tx: {successTxId}
              </div>
            ) : (
              <button
                className="btn btn-primary"
                style={{ marginTop: '16px' }}
                onClick={handleSignWithPera}
                disabled={signing || !execution}
              >
                {signing ? 'Signing...' : 'Sign with Pera'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ApproveExecution;
