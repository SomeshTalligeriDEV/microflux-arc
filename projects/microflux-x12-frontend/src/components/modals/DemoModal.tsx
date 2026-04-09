// components/modals/DemoModal.tsx — Demo flow selector
import React from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { DEMO_FLOWS } from '../../data/demoFlows';
import { X, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

const DemoModal: React.FC = () => {
  const show = useUIStore((s) => s.showDemoModal);
  const setShow = useUIStore((s) => s.setShowDemoModal);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);

  if (!show) return null;

  const handleSelect = (demo: typeof DEMO_FLOWS[0]) => {
    // Deep clone to avoid mutation
    const cloned = JSON.parse(JSON.stringify(demo));
    cloned.id = `demo_${Date.now()}`;
    loadWorkflow(cloned);
    toast.success(`Loaded: ${demo.name}`);
    setShow(false);
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={() => setShow(false)}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="modal-title" style={{ marginBottom: 0 }}>
            <Zap size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle', color: 'var(--accent-amber)' }} />
            Demo Flows
          </div>
          <button className="btn-icon" onClick={() => setShow(false)}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Load a pre-built workflow to explore the builder. Fill in receiver address and other details, then simulate & deploy.
        </p>

        {DEMO_FLOWS.map((demo) => (
          <div
            key={demo.id}
            className="demo-card"
            onClick={() => handleSelect(demo)}
          >
            <div className="demo-card-title">{demo.name}</div>
            <div className="demo-card-desc">{demo.description}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              {demo.nodes.map((n: any) => (
                <span key={n.id} className="badge badge-info" style={{ fontSize: 10 }}>
                  {(n.data as any).category === 'transaction' ? 'Payment' :
                   (n.data as any).category === 'asset_transfer' ? 'ASA' :
                   (n.data as any).category === 'app_call' ? 'App Call' : 'Note'}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DemoModal;
