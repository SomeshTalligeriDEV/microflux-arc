import { useState } from 'react';
import { useWorkflowStore, useSimulationStore } from '../../../stores';
import { compileWorkflowToTransactions } from '../../../utils/workflow/compiler';
import { runSimulation } from '../../../utils/algorand/dryrun';
import { Transaction } from 'algosdk';

const SimulationPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { nodes, edges, validateWorkflow } = useWorkflowStore();
  const { status, steps, totalFees, error, startSimulation, setSteps, completeSimulation, failSimulation, resetSimulation } = useSimulationStore();
  
  const handleSimulate = async () => {
    // Reset first
    resetSimulation();
    startSimulation();
    
    // Validate workflow
    const validation = validateWorkflow();
    if (!validation.valid) {
      failSimulation(validation.errors.join(', '));
      return;
    }
    
    try {
      // Compile to transactions
      const sender = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'; // Dummy address for simulation
      const txns = await compileWorkflowToTransactions(nodes, edges, sender);
      
      if (txns.length === 0) {
        failSimulation('No executable transactions in workflow');
        return;
      }
      
      // Run simulation
      const result = await runSimulation(txns);
      
      setSteps(result.steps);
      completeSimulation(result.success, result.totalFees);
      
      if (!result.success) {
        failSimulation(result.error || 'Simulation failed');
      }
    } catch (e: any) {
      failSimulation(e.message || 'Simulation error');
    }
  };
  
  const getStatusColor = () => {
    switch (status) {
      case 'running': return 'text-yellow-400';
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };
  
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm hover:bg-[#252535] transition-colors flex items-center gap-2"
      >
        <span className="text-[#00d4aa]">🔬</span>
        Open Simulation
      </button>
    );
  }
  
  return (
    <div className="bg-[#1a1a2e] border border-gray-700 rounded-lg p-4 w-[600px] max-h-[400px] overflow-y-auto shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <span>🔬</span> Simulation
        </h3>
        <div className="flex items-center gap-2">
          {status !== 'idle' && status !== 'running' && (
            <button
              onClick={resetSimulation}
              className="text-gray-400 hover:text-white text-xs px-2 py-1"
            >
              Reset
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>
      
      {/* Status */}
      <div className={`mb-4 text-sm ${getStatusColor()}`}>
        {status === 'idle' && 'Ready to simulate'}
        {status === 'running' && 'Running simulation...'}
        {status === 'success' && 'Simulation successful ✓'}
        {status === 'error' && `Error: ${error}`}
      </div>
      
      {/* Steps */}
      {steps.length > 0 && (
        <div className="space-y-2 mb-4">
          {steps.map((step, index) => (
            <div 
              key={index} 
              className={`p-3 rounded border ${
                step.status === 'success' 
                  ? 'border-green-500/30 bg-green-500/10' 
                  : step.status === 'error'
                  ? 'border-red-500/30 bg-red-500/10'
                  : 'border-gray-700 bg-[#0a0a0f]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs">Step {step.step}</span>
                  <span className="text-white text-sm">{step.description}</span>
                </div>
                <span className="text-gray-400 text-xs">
                  {(step.fee / 1_000_000).toFixed(6)} ALGO
                </span>
              </div>
              <div className="text-gray-500 text-xs mt-1">
                {step.sender.slice(0, 8)}...{step.sender.slice(-4)} 
                {step.receiver && ` → ${step.receiver.slice(0, 8)}...${step.receiver.slice(-4)}`}
                {step.amount && ` | ${step.amount}`}
                {step.assetId && ` | Asset ${step.assetId}`}
                {step.appId && ` | App ${step.appId}`}
              </div>
              {step.error && (
                <div className="text-red-400 text-xs mt-1">{step.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Total Fees */}
      {steps.length > 0 && status !== 'idle' && (
        <div className="flex justify-between items-center py-3 border-t border-gray-700">
          <span className="text-gray-400 text-sm">Total Estimated Fees:</span>
          <span className="text-[#00d4aa] font-mono">
            {(totalFees / 1_000_000).toFixed(6)} ALGO
          </span>
        </div>
      )}
      
      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSimulate}
          disabled={status === 'running' || nodes.length === 0}
          className="flex-1 px-4 py-2 bg-[#00d4aa] text-[#0a0a0f] font-medium rounded hover:bg-[#00b894] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'running' ? 'Simulating...' : 'Run Simulation'}
        </button>
      </div>
    </div>
  );
};

export default SimulationPanel;
