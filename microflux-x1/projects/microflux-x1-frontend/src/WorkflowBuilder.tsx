import { useWallet } from '@txnlab/use-wallet-react';
import WorkflowCanvas from './components/workflow/WorkflowCanvas';
import ConnectWallet from './components/ConnectWallet';
import { useState } from 'react';

const WorkflowBuilder = () => {
  const { activeAddress } = useWallet();
  const [showWalletModal, setShowWalletModal] = useState(false);

  if (!activeAddress) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">
            MICROFLUX<span className="text-[#00d4aa]">-X1</span>
          </h1>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            A visual transaction composer for Algorand. 
            Build, simulate, and deploy multi-step workflows.
          </p>
          <button
            onClick={() => setShowWalletModal(true)}
            className="px-6 py-3 bg-[#00d4aa] text-[#0a0a0f] font-semibold rounded-lg hover:bg-[#00b894] transition-colors"
          >
            Connect Wallet to Start
          </button>
          <ConnectWallet 
            openModal={showWalletModal} 
            closeModal={() => setShowWalletModal(false)} 
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="h-14 bg-[#12121a] border-b border-gray-800 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-white">
            MICROFLUX<span className="text-[#00d4aa]">-X1</span>
          </span>
          <span className="text-xs text-gray-500 px-2 py-0.5 border border-gray-700 rounded">
            Beta
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-gray-400">Connected</div>
            <div className="text-sm text-white font-mono">
              {activeAddress.slice(0, 6)}...{activeAddress.slice(-4)}
            </div>
          </div>
          <button
            onClick={() => setShowWalletModal(true)}
            className="px-3 py-1.5 text-xs text-gray-300 border border-gray-700 rounded hover:bg-gray-800 transition-colors"
          >
            Switch Wallet
          </button>
        </div>
      </div>

      {/* Main Content */}
      <WorkflowCanvas />

      <ConnectWallet 
        openModal={showWalletModal} 
        closeModal={() => setShowWalletModal(false)} 
      />
    </div>
  );
};

export default WorkflowBuilder;
