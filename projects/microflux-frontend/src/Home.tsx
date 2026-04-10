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
import { api, type Workflow } from './services/api';
import SavedWorkflows from './components/SavedWorkflows';

const Home: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [openWalletModal, setOpenWalletModal] = useState(false);
  const { activeAddress, transactionSigner } = useWallet();

  // Wallet balance state
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isLinked, setIsLinked] = useState(false);

  // Network name
  const algoConfig = getAlgodConfigFromViteEnvironment();
  const networkName = algoConfig.network === '' ? 'localnet' : algoConfig.network.toLowerCase();

  // Workflow state (shared between AI/Marketplace/Builder)
  const [workflowNodes, setWorkflowNodes] = useState<AINode[]>([]);
  const [workflowEdges, setWorkflowEdges] = useState<AIEdge[]>([]);
  const [workflowName, setWorkflowName] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!activeAddress) {
      setIsLinked(false);
      return;
    }

    api.getLinkStatus(activeAddress)
      .then((data) => setIsLinked(Boolean(data.linked)))
      .catch((error) => {
        console.warn('[MICROFLUX] Failed to fetch Telegram link status', error);
        setIsLinked(false);
      });
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
  const handleLoadWorkflow = useCallback((nodes: AINode[], edges: AIEdge[], name: string, workflowId: string | null = null) => {
    setWorkflowNodes(nodes);
    setWorkflowEdges(edges);
    setWorkflowName(name);
    setSelectedWorkflowId(workflowId);
    setCurrentPage('builder');
  }, []);

  const normalizeLoadedNode = useCallback((node: any, index: number): AINode => {
    const type = String(node?.type ?? 'debug_log');
    const category = typeof node?.category === 'string'
      ? String(node.category).toLowerCase()
      : 'logic';

    return {
      id: String(node?.id ?? `node_${index + 1}`),
      type,
      label: String(node?.label ?? type.replace(/_/g, ' ')),
      category: (['trigger', 'action', 'logic', 'defi', 'notification'].includes(category)
        ? category
        : 'logic') as AINode['category'],
      config: (node?.config ?? node?.params ?? {}) as Record<string, unknown>,
      position: {
        x: Number(node?.position?.x ?? node?.x ?? index * 280),
        y: Number(node?.position?.y ?? node?.y ?? 120),
      },
    };
  }, []);

  const normalizeLoadedEdge = useCallback((edge: any, index: number): AIEdge => ({
    id: String(edge?.id ?? `edge_${index + 1}`),
    source: String(edge?.source ?? edge?.from ?? ''),
    target: String(edge?.target ?? edge?.to ?? ''),
  }), []);

  const handleOpenSavedWorkflow = useCallback((workflow: Workflow) => {
    const nodes = (Array.isArray(workflow.nodes) ? workflow.nodes : []).map(normalizeLoadedNode);
    const edges = (Array.isArray(workflow.edges) ? workflow.edges : [])
      .map(normalizeLoadedEdge)
      .filter((edge) => edge.source && edge.target);

    handleLoadWorkflow(nodes, edges, workflow.name, workflow.id);
  }, [handleLoadWorkflow, normalizeLoadedEdge, normalizeLoadedNode]);

  const renderPage = () => {
    switch (currentPage) {
      case 'builder':
        return (
          <WorkflowBuilder
            initialNodes={workflowNodes}
            initialEdges={workflowEdges}
            workflowName={workflowName}
            workflowId={selectedWorkflowId}
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
            activeAddress={activeAddress ?? null}
          />
        );
      case 'market':
        return (
          <MarketDataPanel
            activeAddress={activeAddress ?? null}
            transactionSigner={transactionSigner}
            networkName={networkName}
          />
        );
      case 'saved':
        return (
          <SavedWorkflows
            activeAddress={activeAddress ?? null}
            onOpenWorkflow={handleOpenSavedWorkflow}
          />
        );
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
        isLinked={isLinked}
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
