import React, { useState, useCallback } from 'react';
import AICopilotPanel from './AICopilotPanel';
import type { AINode, AIEdge } from '../services/aiService';

interface AIPageProps {
  onLoadDraft: (draftWorkflow: { name?: string; nodes?: unknown[]; edges?: unknown[] }) => void;
  activeAddress: string | null;
}

const AIPage: React.FC<AIPageProps> = ({ onLoadDraft, activeAddress }) => {
  const [generatedWorkflow, setGeneratedWorkflow] = useState<{
    nodes: AINode[];
    edges: AIEdge[];
    name: string;
  } | null>(null);

  const handleLoadWorkflow = useCallback((nodes: AINode[], edges: AIEdge[], name: string) => {
    setGeneratedWorkflow({ nodes, edges, name });
    onLoadDraft({ name, nodes, edges });
  }, [onLoadDraft]);

  return (
    <div className="page-container animate-fadeIn">
      <div className="page-header">
        <h1 className="page-title">FluxBot</h1>
        <p className="page-subtitle">
          Describe your workflow in natural language. AI builds it for you.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left: AI Panel */}
        <div>
          <AICopilotPanel
            onLoadWorkflow={handleLoadWorkflow}
            activeAddress={activeAddress}
          />
        </div>

        {/* Right: Demo / Instructions */}
        <div>
          <div className="card" style={{ marginBottom: '16px' }}>
            <h3 className="text-lg" style={{ marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              How It Works
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { step: '01', title: 'Describe', desc: 'Type what your workflow should do in plain English' },
                { step: '02', title: 'Generate', desc: 'AI creates nodes, connections, and explains the logic' },
                { step: '03', title: 'Review', desc: 'Check the generated workflow structure and explanation' },
                { step: '04', title: 'Execute', desc: 'Load into canvas, simulate, then execute on-chain' },
              ].map((item) => (
                <div key={item.step} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-accent-dim)',
                    border: '1px solid var(--color-border-accent)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    color: 'var(--color-accent)',
                    flexShrink: 0,
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <div className="text-sm font-bold">{item.title}</div>
                    <div className="text-xs text-muted">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Safety Notice */}
          <div className="card" style={{
            borderColor: 'rgba(245, 158, 11, 0.3)',
            background: 'rgba(245, 158, 11, 0.05)',
          }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-warning)' }}>NOTE</span>
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--color-warning)', marginBottom: '4px' }}>
                  Safety Notice
                </div>
                <div className="text-xs text-muted">
                  AI is <strong>assistive only</strong> — it never executes transactions directly.
                  All workflows must be reviewed and explicitly executed by you.
                  Schema validation ensures AI output integrity before rendering.
                </div>
              </div>
            </div>
          </div>

          {/* Last Generated Preview */}
          {generatedWorkflow && (
            <div className="card animate-slideUp" style={{ marginTop: '16px' }}>
              <div className="text-xs text-uppercase" style={{
                letterSpacing: '0.08em',
                fontWeight: 600,
                color: 'var(--color-text-tertiary)',
                marginBottom: '8px',
              }}>
                Last Generated
              </div>
              <div className="text-sm font-bold" style={{ marginBottom: '8px' }}>
                {generatedWorkflow.name}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {generatedWorkflow.nodes.map((node) => (
                  <span key={node.id} className={`tag tag-sm tag-${node.category}`}>
                    {node.label}
                  </span>
                ))}
              </div>
              <div className="text-xs text-muted" style={{ marginTop: '8px' }}>
                ✓ Loaded into Builder canvas
              </div>
            </div>
          )}

          {/* Example Prompts */}
          <div className="card" style={{ marginTop: '16px' }}>
            <div className="text-xs text-uppercase" style={{
              letterSpacing: '0.08em',
              fontWeight: 600,
              color: 'var(--color-text-tertiary)',
              marginBottom: '12px',
            }}>
              Example Prompts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                '"Send 1 ALGO to address X"',
                '"Create a treasury that splits funds 40/35/25 to three wallets"',
                '"Monitor ALGO price and notify me on Telegram when it hits $0.50"',
                '"Every hour, check my balance and if above 100 ALGO, send 10 to savings"',
              ].map((prompt, i) => (
                <div key={i} style={{
                  padding: '8px 12px',
                  background: 'var(--color-bg-input)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-secondary)',
                  fontStyle: 'italic',
                }}>
                  {prompt}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIPage;
