import React, { useState, useCallback } from 'react';
import { generateWorkflow, explainWorkflow, type AIWorkflowResult, type AINode, type AIEdge } from '../services/aiService';

interface AICopilotPanelProps {
  onLoadWorkflow: (nodes: AINode[], edges: AIEdge[], name: string) => void;
  groqApiKey: string;
  onApiKeyChange: (key: string) => void;
}

const AICopilotPanel: React.FC<AICopilotPanelProps> = ({
  onLoadWorkflow,
  groqApiKey,
  onApiKeyChange,
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIWorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    if (!groqApiKey.trim()) {
      setShowKeyInput(true);
      setError('Please enter your Groq API key first.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const workflow = await generateWorkflow(prompt, groqApiKey);
      setResult(workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [prompt, groqApiKey]);

  const handleExplain = useCallback(async () => {
    if (!result) return;
    if (!groqApiKey.trim()) return;

    setLoading(true);
    try {
      const explanation = await explainWorkflow(
        { nodes: result.nodes, edges: result.edges },
        groqApiKey
      );
      setResult({ ...result, explanation });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to explain workflow');
    } finally {
      setLoading(false);
    }
  }, [result, groqApiKey]);

  const handleLoad = useCallback(() => {
    if (!result) return;
    onLoadWorkflow(result.nodes, result.edges, result.name);
  }, [result, onLoadWorkflow]);

  const presetPrompts = [
    'Send 1 ALGO to address X',
    'Distribute funds to 3 team members equally',
    'Monitor ALGO price and alert when above $0.30',
    'Transfer ASA tokens after checking opt-in',
  ];

  return (
    <div className="ai-panel animate-fadeIn">
      <div className="ai-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.2rem' }}>[BOT]</span>
          <span className="text-sm font-bold text-uppercase" style={{ letterSpacing: '0.06em' }}>
            AI COPILOT
          </span>
        </div>
        <div className="ai-panel-badge">
          <span className="status-dot status-dot-success"></span>
          GROQ
        </div>
      </div>

      <div className="ai-panel-body">
        {/* API Key Input */}
        {(showKeyInput || !groqApiKey) && (
          <div style={{ marginBottom: '16px' }}>
            <label
              className="text-xs text-uppercase"
              style={{ display: 'block', marginBottom: '6px', color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', fontWeight: 600 }}
            >
              Groq API Key
            </label>
            <input
              type="password"
              className="input"
              placeholder="gsk_..."
              value={groqApiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
            />
            <p className="text-xs" style={{ marginTop: '4px', color: 'var(--color-text-tertiary)' }}>
              Get free key at <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer">console.groq.com</a>
            </p>
          </div>
        )}

        {/* Prompt Area */}
        <label
          className="text-xs text-uppercase"
          style={{ display: 'block', marginBottom: '6px', color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', fontWeight: 600 }}
        >
          Describe your workflow
        </label>
        <textarea
          className="ai-prompt-area"
          placeholder="e.g., Send 1 ALGO to address X when price drops below $0.20..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleGenerate();
            }
          }}
        />

        {/* Preset Prompts */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
          {presetPrompts.map((p, i) => (
            <button
              key={i}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.65rem', padding: '3px 8px' }}
              onClick={() => setPrompt(p)}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Generate Button */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button
            className="btn btn-accent"
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            style={{ flex: 1 }}
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                GENERATING...
              </>
            ) : (
              '[EXEC] GENERATE WORKFLOW'
            )}
          </button>
          {!groqApiKey && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowKeyInput(true)}>
              API Key required
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            color: 'var(--color-error)',
            fontSize: 'var(--text-xs)',
          }}>
            {error}
          </div>
        )}

        {/* Loading Animation */}
        {loading && (
          <div className="ai-loading">
            <div className="ai-loading-dots">
              <span></span><span></span><span></span>
            </div>
            Thinking...
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div style={{ marginTop: '16px' }} className="animate-slideUp">
            {/* Workflow Name */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}>
              <span className="text-sm font-bold">{result.name}</span>
              <span className="tag tag-sm tag-action">
                {result.nodes.length} nodes
              </span>
            </div>

            {/* Explanation */}
            <div className="ai-response">
              {result.explanation}
            </div>

            {/* Node Preview */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginTop: '12px',
            }}>
              {result.nodes.map((node) => (
                <div key={node.id} className={`tag tag-sm tag-${node.category}`}>
                  {node.label}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={handleLoad} style={{ flex: 1 }}>
                ✓ LOAD INTO CANVAS
              </button>
              <button className="btn btn-outline btn-sm" onClick={handleExplain}>
                EXPLAIN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AICopilotPanel;
