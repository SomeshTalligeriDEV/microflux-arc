// components/panels/SimulationPanel.tsx — Simulation results display
import React from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import { Check, X, Loader2 } from 'lucide-react';
import { microAlgosToAlgos } from '../../lib/algorand';

const SimulationPanel: React.FC = () => {
  const { isSimulating, result, error } = useSimulationStore();

  if (isSimulating) {
    return (
      <div className="empty-state">
        <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-primary)' }} />
        <div className="empty-state-text" style={{ marginTop: 12 }}>
          Running simulation...<br />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Submitting dry-run to Algorand Testnet</span>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-content">
        <div className="sim-step failed" style={{ borderColor: 'rgba(244, 63, 94, 0.4)' }}>
          <div className="sim-step-header">
            <span className="sim-step-title" style={{ color: 'var(--accent-rose)' }}>Simulation Error</span>
            <X size={16} color="var(--accent-rose)" />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🧪</div>
        <div className="empty-state-text">
          No simulation results yet<br />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Click "Simulate" to run a dry-run
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-content">
      {/* Overall status */}
      <div
        className="badge"
        style={{
          marginBottom: 14,
          fontSize: 13,
          padding: '6px 14px',
          background: result.success ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
          color: result.success ? '#34d399' : '#fb7185',
        }}
      >
        {result.success ? <Check size={14} /> : <X size={14} />}
        {result.success ? 'All steps pass' : 'Simulation failed'}
      </div>

      {/* Steps */}
      {result.steps.map((step, i) => (
        <div
          key={step.nodeId}
          className={`sim-step ${step.status} animate-fade-in-up`}
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="sim-step-header">
            <span className="sim-step-title">
              Step {step.index + 1} — {step.type}
            </span>
            {step.status === 'success' ? (
              <span className="badge badge-success"><Check size={10} /> Pass</span>
            ) : (
              <span className="badge badge-error"><X size={10} /> Fail</span>
            )}
          </div>

          <div className="sim-step-row">
            <span className="sim-step-label">Type</span>
            <span className="sim-step-value">{step.type}</span>
          </div>
          <div className="sim-step-row">
            <span className="sim-step-label">Sender</span>
            <span className="sim-step-value">{step.sender}</span>
          </div>
          <div className="sim-step-row">
            <span className="sim-step-label">Receiver</span>
            <span className="sim-step-value">{step.receiver || '—'}</span>
          </div>
          <div className="sim-step-row">
            <span className="sim-step-label">Amount</span>
            <span className="sim-step-value">{step.amount}</span>
          </div>
          <div className="sim-step-row">
            <span className="sim-step-label">Fee</span>
            <span className="sim-step-value">{microAlgosToAlgos(step.fee)} ALGO</span>
          </div>
          {step.errorMessage && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--accent-rose)', wordBreak: 'break-word' }}>
              {step.errorMessage}
            </div>
          )}
        </div>
      ))}

      {/* Total fees */}
      <div className="sim-total">
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>TOTAL FEES</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          {microAlgosToAlgos(result.totalFees)} ALGO
        </div>
      </div>
    </div>
  );
};

export default SimulationPanel;
