import { useWallet } from '@txnlab/use-wallet-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import WorkflowBuilder from './components/WorkflowBuilder';
import Marketplace from './components/Marketplace';
import AIPage from './components/AIPage';
import MarketDataPanel from './components/MarketDataPanel';
import ConnectWallet from './components/ConnectWallet';
import type { AINode, AIEdge } from './services/aiService';
import { inferCategory } from './services/nodeDefinitions';
import { fetchAccountBalance } from './services/walletService';
import { getAlgodConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs';
import { api, type Workflow } from './services/api';
import SavedWorkflows from './components/SavedWorkflows';
import TelegramLinkModal from './components/TelegramLinkModal';

type DraftWorkflowPayload = {
  name?: string;
  nodes?: unknown[];
  edges?: unknown[];
};

const ROUTE_PAGE_MAP: Record<string, string> = {
  '/': 'home',
  '/builder': 'builder',
  '/marketplace': 'marketplace',
  '/market': 'market',
  '/saved': 'saved',
  '/ai': 'ai',
};

const Home: React.FC = () => {
  const [openWalletModal, setOpenWalletModal] = useState(false);
  const [openTelegramLinkModal, setOpenTelegramLinkModal] = useState(false);
  const { activeAddress, transactionSigner } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isLinked, setIsLinked] = useState(false);

  const algoConfig = getAlgodConfigFromViteEnvironment();
  const networkName = algoConfig.network === '' ? 'localnet' : algoConfig.network.toLowerCase();
  const currentPage = ROUTE_PAGE_MAP[location.pathname] ?? 'home';

  const [workflowNodes, setWorkflowNodes] = useState<AINode[]>([]);
  const [workflowEdges, setWorkflowEdges] = useState<AIEdge[]>([]);
  const [workflowName, setWorkflowName] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

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

  const refreshLinkStatus = useCallback(async () => {
    if (!activeAddress) {
      setIsLinked(false);
      return;
    }

    try {
      const data = await api.getLinkStatus(activeAddress);
      setIsLinked(Boolean(data.linked));
    } catch (error) {
      console.warn('[MICROFLUX] Failed to refresh Telegram link status', error);
      setIsLinked(false);
    }
  }, [activeAddress]);

  const handleNavigate = useCallback((page: string) => {
    navigate(page === 'home' ? '/' : `/${page}`);
  }, [navigate]);

  const toggleWalletModal = useCallback(() => {
    setOpenWalletModal((prev) => !prev);
  }, []);

  const toggleTelegramLinkModal = useCallback(() => {
    setOpenTelegramLinkModal((prev) => !prev);
  }, []);

  const handleBalanceUpdate = useCallback((balance: number) => {
    setWalletBalance(balance);
  }, []);

  const handleLoadWorkflow = useCallback((nodes: AINode[], edges: AIEdge[], name: string, workflowId: string | null = null) => {
    setWorkflowNodes([...nodes]);
    setWorkflowEdges([...edges]);
    setWorkflowName(name);
    setSelectedWorkflowId(workflowId);
    navigate('/builder');
  }, [navigate]);

  const normalizeLoadedNode = useCallback((node: any, index: number): AINode => {
    const type = String(node?.type ?? 'debug_log');
    const rawCategory = typeof node?.category === 'string'
      ? String(node.category).toLowerCase()
      : '';
    const VALID_CATEGORIES = ['trigger', 'action', 'logic', 'defi', 'notification'];
    const category = VALID_CATEGORIES.includes(rawCategory)
      ? rawCategory
      : inferCategory(type);

    return {
      id: String(node?.id ?? `node_${index + 1}`),
      type,
      label: String(node?.label ?? type.replace(/_/g, ' ')),
      category: category as AINode['category'],
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

  const handleLoadDraft = useCallback((draftWorkflow: DraftWorkflowPayload) => {
    const rawNodes = Array.isArray(draftWorkflow?.nodes) ? draftWorkflow.nodes : [];
    const rawEdges = Array.isArray(draftWorkflow?.edges) ? draftWorkflow.edges : [];

    const nodes = rawNodes.map((node: any, index) => {
      const normalized = normalizeLoadedNode(node, index);
      const data = node?.data && typeof node.data === 'object' ? node.data : {};
      return {
        ...normalized,
        label: String(data?.label ?? normalized.label),
        config: (data?.config ?? normalized.config) as Record<string, unknown>,
      };
    });

    const edges = rawEdges
      .map((edge: any, index) => normalizeLoadedEdge(edge, index))
      .filter((edge) => edge.source && edge.target);

    setWorkflowNodes(nodes);
    setWorkflowEdges(edges);
    setWorkflowName(String(draftWorkflow?.name ?? 'AI Draft Workflow'));
    setSelectedWorkflowId(null);
    navigate('/builder');
  }, [navigate, normalizeLoadedEdge, normalizeLoadedNode]);

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
        onLinkTelegram={toggleTelegramLinkModal}
      />

      <Routes>
        <Route path="/" element={<HeroSection onNavigate={handleNavigate} />} />
        <Route
          path="/builder"
          element={
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
          }
        />
        <Route
          path="/marketplace"
          element={
            <Marketplace
              onUseTemplate={handleLoadWorkflow}
              onNavigateToBuilder={() => navigate('/builder')}
            />
          }
        />
        <Route
          path="/market"
          element={
            <MarketDataPanel
              activeAddress={activeAddress ?? null}
              transactionSigner={transactionSigner}
              networkName={networkName}
            />
          }
        />
        <Route
          path="/saved"
          element={
            <SavedWorkflows
              activeAddress={activeAddress ?? null}
              onOpenWorkflow={handleOpenSavedWorkflow}
            />
          }
        />
        <Route
          path="/ai"
          element={
            <AIPage
              onLoadDraft={handleLoadDraft}
              activeAddress={activeAddress ?? null}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <ConnectWallet
        openModal={openWalletModal}
        closeModal={toggleWalletModal}
        onBalanceUpdate={handleBalanceUpdate}
      />

      <TelegramLinkModal
        openModal={openTelegramLinkModal}
        closeModal={toggleTelegramLinkModal}
        activeAddress={activeAddress ?? null}
        isLinked={isLinked}
        onRefreshLinkStatus={refreshLinkStatus}
      />
    </div>
  );
};

export default Home;
