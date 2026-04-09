// components/canvas/Toolbar.tsx — Floating action toolbar
import React from 'react';
import { Play, FileText, Sparkles, Save, Download, Upload, Trash2, Loader2 } from 'lucide-react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { useSimulationStore } from '../../stores/simulationStore';
import { useUIStore } from '../../stores/uiStore';
import { storage, exportWorkflowToFile } from '../../lib/storage';
import { getAlgodClient } from '../../lib/algorand';
import { simulateWorkflow } from '../../lib/simulator';
import { validateFlow } from '../../lib/validator';
import toast from 'react-hot-toast';

const Toolbar: React.FC = () => {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const exportWorkflow = useWorkflowStore((s) => s.exportWorkflow);
  const clearWorkflow = useWorkflowStore((s) => s.clearWorkflow);
  const isSimulating = useSimulationStore((s) => s.isSimulating);
  const { startSimulation, setResult, setError } = useSimulationStore();
  const { setActivePanel, setShowWalletModal } = useUIStore();

  const handleSave = () => {
    storage.saveWorkflow(exportWorkflow());
    toast.success('Saved to local storage');
  };

  const handleExport = () => {
    exportWorkflowToFile(exportWorkflow());
  };

  const handleRun = async () => {
    const validation = validateFlow(nodes, edges);
    if (!validation.isValid) {
      toast.error('Fix validation errors first');
      return;
    }
    
    startSimulation();
    setActivePanel('simulation');
    
    try {
      const algod = getAlgodClient();
      const result = await simulateWorkflow(nodes, edges, algod, 'SENDER_ADDR'); // Simplified for UI demo
      setResult(result);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="floating-toolbar">
      <div className="toolbar-section status">
        <span className={`status-indicator ${isSimulating ? 'running' : 'idle'}`} />
        <span className="status-label">{isSimulating ? 'SIMULATING' : 'IDLE'}</span>
      </div>
      
      <div className="toolbar-divider" />
      
      <button className="toolbar-btn btn-run" onClick={handleRun} disabled={isSimulating}>
        {isSimulating ? <Loader2 className="spinning" size={16} /> : <Play size={16} fill="currentColor" />}
        <span>Run Agent</span>
      </button>

      <button className="toolbar-btn">
        <FileText size={16} />
        <span>Log</span>
      </button>

      <div className="toolbar-divider" />

      <button className="toolbar-btn btn-ai">
        <Sparkles size={16} fill="currentColor" />
        <span>AI</span>
      </button>

      <div className="toolbar-divider" />

      <button className="toolbar-btn" onClick={handleSave} title="Save">
        <Save size={16} />
        <span>Save</span>
      </button>

      <button className="toolbar-btn" onClick={handleExport} title="Export">
        <Download size={16} />
        <span>Export</span>
      </button>

      <button className="toolbar-btn" title="Import">
        <Upload size={16} />
        <span>Import</span>
      </button>

      <div className="toolbar-divider" />

      <button className="toolbar-btn btn-clear" onClick={clearWorkflow} title="Clear">
        <Trash2 size={16} />
        <span>Clear</span>
      </button>
    </div>
  );
};

export default Toolbar;
