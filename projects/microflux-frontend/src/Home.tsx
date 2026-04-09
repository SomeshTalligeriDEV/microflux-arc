import { useWallet } from '@txnlab/use-wallet-react';
import React, { useState, useCallback, useEffect } from 'react';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import WorkflowBuilder from './components/WorkflowBuilder';
import Marketplace from './components/Marketplace';
import AIPage from './components/AIPage';
import MarketDataPanel from './components/MarketDataPanel';
import ConnectWallet from './components/ConnectWallet';
import type { AINode, AIEdge } from './services/aiService';
import { fetchAccountBalance } from './services/walletService';
import { getAlgodConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs';

const Home: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [openWalletModal, setOpenWalletModal] = useState(false);
  const [groqApiKey, setGroqApiKey] = useState('');
  const { activeAddress, transactionSigner } = useWallet();

  // Wallet balance state
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  // Network name
  const algoConfig = getAlgodConfigFromViteEnvironment();
  const networkName = algoConfig.network === '' ? 'localnet' : algoConfig.network.toLowerCase();

  // Workflow state (shared between AI/Marketplace/Builder)
  const [workflowNodes, setWorkflowNodes] = useState<AINode[]>([]);
  const [workflowEdges, setWorkflowEdges] = useState<AIEdge[]>([]);
  const [workflowName, setWorkflowName] = useState('');

  // Auto-fetch balance on wallet connect
  useEffect(() => {
    if (activeAddress) {
      fetchAccountBalance(activeAddress).then((bal) => {
        setWalletBalance(bal.balanceAlgos);
      }).catch(() => setWalletBalance(null));
    } else {
      setWalletBalance(null);
    }
  }, [activeAddress]);

  const handleNavigate = useCallback((page: string) => {
    setCurrentPage(page);
  }, []);

  const toggleWalletModal = useCallback(() => {
    setOpenWalletModal((prev) => !prev);
  }, []);

  const handleBalanceUpdate = useCallback((balance: number) => {
    setWalletBalance(balance);
  }, []);

  // Load workflow from AI or Marketplace
  const handleLoadWorkflow = useCallback((nodes: AINode[], edges: AIEdge[], name: string) => {
    setWorkflowNodes(nodes);
    setWorkflowEdges(edges);
    setWorkflowName(name);
    setCurrentPage('builder');
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'builder':
        return (
          <WorkflowBuilder
            initialNodes={workflowNodes}
            initialEdges={workflowEdges}
            workflowName={workflowName}
            activeAddress={activeAddress ?? null}
            transactionSigner={transactionSigner}
            networkName={networkName}
            onBalanceUpdate={handleBalanceUpdate}
          />
        );
      case 'marketplace':
        return (
          <Marketplace
            onUseTemplate={handleLoadWorkflow}
            onNavigateToBuilder={() => setCurrentPage('builder')}
          />
        );
      case 'ai':
        return (
          <AIPage
            onLoadWorkflow={handleLoadWorkflow}
            groqApiKey={groqApiKey}
            onApiKeyChange={setGroqApiKey}
          />
        );
      case 'market':
        return <MarketDataPanel />;
      default:
        return <HeroSection onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="app-layout">
      <Navbar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        activeAddress={activeAddress ?? null}
        onConnectWallet={toggleWalletModal}
        balance={walletBalance}
        networkName={networkName}
      />

      {renderPage()}

      <ConnectWallet
        openModal={openWalletModal}
        closeModal={toggleWalletModal}
        onBalanceUpdate={handleBalanceUpdate}
      />
    </div>
  );
};

export default Home;
