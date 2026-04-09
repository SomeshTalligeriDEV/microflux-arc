// src/App.tsx — Root application with providers and layout
import { WalletId, WalletManager, WalletProvider, type SupportedWallet } from '@txnlab/use-wallet-react';
import { Toaster } from 'react-hot-toast';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import StatusBar from './components/layout/StatusBar';
import WorkflowCanvas from './components/canvas/WorkflowCanvas';
import RightPanel from './components/panels/RightPanel';
import WalletModal from './components/modals/WalletModal';
import DemoModal from './components/modals/DemoModal';
import LandingPage from './components/layout/LandingPage';
import LoadingPage from './components/layout/LoadingPage';
import { getAlgodConfigFromViteEnvironment, getKmdConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs';
import { useUIStore } from './stores/uiStore';

function getSupportedWallets(): SupportedWallet[] {
  if (import.meta.env.VITE_ALGOD_NETWORK === 'localnet') {
    const kmdConfig = getKmdConfigFromViteEnvironment();
    return [
      {
        id: WalletId.KMD,
        options: {
          baseServer: kmdConfig.server,
          token: String(kmdConfig.token),
          port: String(kmdConfig.port),
        },
      },
    ];
  }
  return [
    { id: WalletId.PERA },
    { id: WalletId.DEFLY },
    { id: WalletId.EXODUS },
  ];
}

export default function App() {
  const algodConfig = getAlgodConfigFromViteEnvironment();
  const currentView = useUIStore((s) => s.currentView);

  const walletManager = new WalletManager({
    wallets: getSupportedWallets(),
    defaultNetwork: algodConfig.network,
    networks: {
      [algodConfig.network]: {
        algod: {
          baseServer: algodConfig.server,
          port: algodConfig.port,
          token: String(algodConfig.token),
        },
      },
    },
    options: {
      resetNetwork: true,
    },
  });

  return (
    <WalletProvider manager={walletManager}>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1a1a2e',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px',
            fontSize: '13px',
            fontFamily: "'Inter', sans-serif",
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#1a1a2e' },
          },
          error: { primary: '#f43f5e', secondary: '#1a1a2e' },
        }}
      />

      {currentView === 'landing' && <LandingPage />}
      {currentView === 'loading' && <LoadingPage />}
      
      {currentView === 'builder' && (
        <div className="app-layout animate-fade-in">
          <Header />
          <Sidebar />
          <WorkflowCanvas />
          <RightPanel />
          <StatusBar />
        </div>
      )}

      {/* Modals */}
      <WalletModal />
      <DemoModal />
    </WalletProvider>
  );
}
