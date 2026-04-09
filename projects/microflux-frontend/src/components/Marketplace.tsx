import React, { useState, useMemo } from 'react';
import {
  TEMPLATES,
  CATEGORIES,
  searchTemplates,
  type WorkflowTemplate,
  type TemplateCategory,
} from '../services/templateService';
import type { AINode, AIEdge } from '../services/aiService';

interface MarketplaceProps {
  onUseTemplate: (nodes: AINode[], edges: AIEdge[], name: string) => void;
  onNavigateToBuilder: () => void;
}

// ── Mini Graph Preview ──────────────────────

const MiniGraphPreview: React.FC<{ template: WorkflowTemplate }> = ({ template }) => {
  // Calculate bounds for scaling
  const nodes = template.nodes;
  if (!nodes.length) return null;

  const minX = Math.min(...nodes.map((n) => n.position.x));
  const maxX = Math.max(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const maxY = Math.max(...nodes.map((n) => n.position.y));

  const rangeX = Math.max(maxX - minX, 100);
  const rangeY = Math.max(maxY - minY, 100);

  const scaleX = (x: number) => ((x - minX) / rangeX) * 80 + 10;
  const scaleY = (y: number) => ((y - minY) / rangeY) * 70 + 15;

  const categoryColors: Record<string, string> = {
    trigger: '#8b5cf6',
    action: '#3b82f6',
    logic: '#f59e0b',
    defi: '#10b981',
    notification: '#ec4899',
  };

  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ opacity: 0.7 }}>
      {/* Edges */}
      {template.edges.map((edge) => {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (!src || !tgt) return null;
        return (
          <line
            key={edge.id}
            x1={scaleX(src.position.x) + 8}
            y1={scaleY(src.position.y)}
            x2={scaleX(tgt.position.x)}
            y2={scaleY(tgt.position.y)}
            stroke="#333"
            strokeWidth="0.8"
          />
        );
      })}
      {/* Nodes */}
      {nodes.map((node) => (
        <g key={node.id}>
          <rect
            x={scaleX(node.position.x)}
            y={scaleY(node.position.y) - 5}
            width="16"
            height="10"
            rx="1.5"
            fill={categoryColors[node.category] || '#666'}
            opacity="0.8"
          />
        </g>
      ))}
    </svg>
  );
};

// ── Marketplace Component ────────────────────

const Marketplace: React.FC<MarketplaceProps> = ({ onUseTemplate, onNavigateToBuilder }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);

  const filteredTemplates = useMemo(() => {
    let results = searchQuery ? searchTemplates(searchQuery) : TEMPLATES;
    if (activeCategory !== 'all') {
      results = results.filter((t) => t.category === activeCategory);
    }
    return results;
  }, [searchQuery, activeCategory]);

  const handleUse = (template: WorkflowTemplate) => {
    onUseTemplate(template.nodes, template.edges, template.name);
    onNavigateToBuilder();
  };

  const difficultyColors: Record<string, string> = {
    beginner: 'var(--color-success)',
    intermediate: 'var(--color-warning)',
    advanced: 'var(--color-error)',
  };

  return (
    <div className="page-container animate-fadeIn">
      <div className="page-header">
        <h1 className="page-title">TEMPLATE MARKETPLACE</h1>
        <p className="page-subtitle">
          Browse and use pre-built workflows. Drag into your canvas in one click.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="marketplace-search">
        <input
          type="text"
          className="input"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: '400px' }}
        />
      </div>

      <div className="marketplace-filters">
        <button
          className={`btn btn-sm ${activeCategory === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveCategory('all')}
        >
          ALL
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`btn btn-sm ${activeCategory === cat.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      <div className="marketplace-grid">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="marketplace-card"
            onClick={() => setSelectedTemplate(template)}
          >
            {/* Preview */}
            <div className="marketplace-card-preview">
              <MiniGraphPreview template={template} />
            </div>

            {/* Body */}
            <div className="marketplace-card-body">
              <div className="marketplace-card-title">{template.name}</div>
              <div className="marketplace-card-desc">{template.description}</div>

              {/* Tags */}
              <div className="marketplace-card-tags">
                {template.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className={`tag tag-sm ${
                      tag === 'real' ? 'tag-real' :
                      tag === 'mock' ? 'tag-mock' :
                      'tag-action'
                    }`}
                  >
                    {tag}
                  </span>
                ))}
                <span
                  className="tag tag-sm"
                  style={{
                    color: difficultyColors[template.difficulty],
                    borderColor: `${difficultyColors[template.difficulty]}40`,
                    background: `${difficultyColors[template.difficulty]}10`,
                  }}
                >
                  {template.difficulty}
                </span>
              </div>

              {/* Footer */}
              <div className="marketplace-card-footer">
                <span className="text-xs text-muted">
                  Gas: {template.estimatedGas}
                </span>
                <button
                  className="btn btn-accent btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUse(template);
                  }}
                >
                  USE TEMPLATE
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">—</div>
          <div className="empty-state-title">No Templates Found</div>
          <div className="empty-state-desc">Try adjusting your search or filters</div>
        </div>
      )}

      {/* Template Detail Modal */}
      {selectedTemplate && (
        <div className="modal modal-open" onClick={() => setSelectedTemplate(null)}>
          <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 className="text-2xl" style={{ marginBottom: '8px' }}>{selectedTemplate.name}</h2>
                <p className="text-sm text-muted">{selectedTemplate.description}</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTemplate(null)}>✕</button>
            </div>

            <div className="divider" />

            {/* Preview */}
            <div style={{
              height: '200px',
              background: 'var(--color-bg-primary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              marginBottom: '16px',
            }}>
              <MiniGraphPreview template={selectedTemplate} />
            </div>

            {/* Details Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div className="sim-panel">
                <div className="sim-row">
                  <span className="sim-label">Nodes</span>
                  <span className="sim-value">{selectedTemplate.nodes.length}</span>
                </div>
                <div className="sim-row">
                  <span className="sim-label">Connections</span>
                  <span className="sim-value">{selectedTemplate.edges.length}</span>
                </div>
                <div className="sim-row">
                  <span className="sim-label">Difficulty</span>
                  <span className="sim-value" style={{ color: difficultyColors[selectedTemplate.difficulty] }}>
                    {selectedTemplate.difficulty}
                  </span>
                </div>
              </div>
              <div className="sim-panel">
                <div className="sim-row">
                  <span className="sim-label">Category</span>
                  <span className="sim-value">{selectedTemplate.category}</span>
                </div>
                <div className="sim-row">
                  <span className="sim-label">Est. Gas</span>
                  <span className="sim-value">{selectedTemplate.estimatedGas}</span>
                </div>
                <div className="sim-row">
                  <span className="sim-label">Author</span>
                  <span className="sim-value">{selectedTemplate.author}</span>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
              {selectedTemplate.tags.map((tag) => (
                <span key={tag} className="tag tag-sm tag-action">{tag}</span>
              ))}
            </div>

            {/* Actions */}
            <div className="modal-action">
              <button className="btn btn-outline" onClick={() => setSelectedTemplate(null)}>
                CANCEL
              </button>
              <button className="btn btn-accent" onClick={() => handleUse(selectedTemplate)}>
                ✓ USE THIS TEMPLATE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Marketplace;
