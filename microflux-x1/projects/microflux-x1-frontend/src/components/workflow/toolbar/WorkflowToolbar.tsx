import { useWorkflowStore, useSimulationStore } from '../../../stores';
import { exportWorkflowToFile, importWorkflowFromFile } from '../../../utils/storage/localStorage';
import { loadDemoWorkflow } from '../../../utils/demoWorkflows';

const WorkflowToolbar = () => {
  const { 
    workflowName, 
    setWorkflowMeta, 
    validateWorkflow, 
    exportWorkflow,
    importWorkflow,
    clearWorkflow,
    nodes,
    lastExecution,
  } = useWorkflowStore();
  const { lastResult } = useSimulationStore();
  
  const handleExport = () => {
    const json = exportWorkflow();
    exportWorkflowToFile(json, workflowName);
  };
  
  const handleImport = async () => {
    try {
      const json = await importWorkflowFromFile();
      importWorkflow(json);
    } catch (e) {
      alert('Failed to import workflow: ' + (e as Error).message);
    }
  };
  
  const handleDeploy = () => {
    const validation = validateWorkflow();
    if (!validation.valid) {
      alert('Validation errors:\n' + validation.errors.join('\n'));
      return;
    }
    
    // TODO: Open deploy modal
    alert('Deploy functionality coming soon!\n\nWorkflow is valid and ready to deploy.');
  };
  
  const handleReplay = () => {
    if (!lastExecution) {
      alert('No previous execution to replay');
      return;
    }
    
    // TODO: Replay last execution
    alert(`Replaying workflow: ${lastExecution.workflowId}\nTransaction IDs: ${lastExecution.txIds.join(', ')}`);
  };
  
  return (
    <div className="h-14 border-b border-gray-800 bg-[#12121a] flex items-center px-4 gap-4">
      {/* Workflow Name */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={workflowName}
          onChange={(e) => setWorkflowMeta(e.target.value)}
          className="bg-[#0a0a0f] border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:border-[#00d4aa] focus:outline-none w-48"
          placeholder="Workflow name..."
        />
      </div>
      
      <div className="h-6 w-px bg-gray-700" />
      
      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          disabled={nodes.length === 0}
          className="px-3 py-1.5 text-sm text-gray-300 hover:text-white border border-gray-700 rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Export
        </button>
        <button
          onClick={handleImport}
          className="px-3 py-1.5 text-sm text-gray-300 hover:text-white border border-gray-700 rounded hover:bg-gray-800 transition-colors"
        >
          Import
        </button>
        <button
          onClick={clearWorkflow}
          disabled={nodes.length === 0}
          className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 border border-red-500/30 rounded hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Clear
        </button>
      </div>
      
      <div className="h-6 w-px bg-gray-700" />
      
      {/* Demo Workflows */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Demos:</span>
        <button
          onClick={() => {
            const demo = loadDemoWorkflow('asa');
            importWorkflow(JSON.stringify(demo));
          }}
          className="px-3 py-1.5 text-xs text-[#6366f1] hover:text-[#5555e1] border border-[#6366f1]/30 rounded hover:bg-[#6366f1]/10 transition-colors"
        >
          ASA Transfer
        </button>
        <button
          onClick={() => {
            const demo = loadDemoWorkflow('treasury');
            importWorkflow(JSON.stringify(demo));
          }}
          className="px-3 py-1.5 text-xs text-[#f59e0b] hover:text-[#e4910a] border border-[#f59e0b]/30 rounded hover:bg-[#f59e0b]/10 transition-colors"
        >
          Treasury
        </button>
      </div>
      
      <div className="flex-1" />
      
      {/* Status */}
      <div className="flex items-center gap-4">
        {lastResult && (
          <span className={`text-xs ${lastResult.success ? 'text-green-400' : 'text-red-400'}`}>
            Last sim: {lastResult.success ? '✓ Success' : '✗ Failed'}
          </span>
        )}
        
        {lastExecution && (
          <button
            onClick={handleReplay}
            className="px-3 py-1.5 text-sm text-[#00d4aa] hover:text-[#00b894] border border-[#00d4aa]/30 rounded hover:bg-[#00d4aa]/10 transition-colors"
          >
            ↻ Replay
          </button>
        )}
        
        <button
          onClick={handleDeploy}
          disabled={nodes.length === 0}
          className="px-4 py-1.5 text-sm bg-[#00d4aa] text-[#0a0a0f] font-medium rounded hover:bg-[#00b894] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Deploy
        </button>
      </div>
    </div>
  );
};

export default WorkflowToolbar;
