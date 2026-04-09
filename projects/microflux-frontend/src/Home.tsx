import { useWallet } from '@txnlab/use-wallet-react';
import React, { useState, useCallback } from 'react';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import WorkflowBuilder from './components/WorkflowBuilder';
import Marketplace from './components/Marketplace';
import AIPage from './components/AIPage';
import MarketDataPanel from './components/MarketDataPanel';
import ConnectWallet from './components/ConnectWallet';
import type { AINode, AIEdge } from './services/aiService';

const Home: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [openWalletModal, setOpenWalletModal] = useState(false);
  const [groqApiKey, setGroqApiKey] = useState('');
  const { activeAddress } = useWallet();

  // Workflow state (shared between AI/Marketplace/Builder)
  const [workflowNodes, setWorkflowNodes] = useState<AINode[]>([]);
  const [workflowEdges, setWorkflowEdges] = useState<AIEdge[]>([]);
  const [workflowName, setWorkflowName] = useState('');

  const handleNavigate = useCallback((page: string) => {
    setCurrentPage(page);
  }, []);

  const toggleWalletModal = useCallback(() => {
    setOpenWalletModal((prev) => !prev);
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
      />

      {renderPage()}

      <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
    </div>
  );
};

export default Home;
