// stores/uiStore.ts — UI state management
import { create } from 'zustand';

export type PanelTab = 'properties' | 'simulation' | 'deployment';
export type AppView = 'landing' | 'loading' | 'builder';

interface UIState {
  theme: 'dark';
  currentView: AppView;
  isLoading: boolean;
  activePanel: PanelTab;
  selectedNodeId: string | null;
  isSidebarCollapsed: boolean;
  isDeploying: boolean;
  showWalletModal: boolean;
  showDemoModal: boolean;
  showImportModal: boolean;

  setView: (view: AppView) => void;
  setIsLoading: (v: boolean) => void;
  setActivePanel: (panel: PanelTab) => void;
  selectNode: (nodeId: string | null) => void;
  toggleSidebar: () => void;
  setIsDeploying: (v: boolean) => void;
  setShowWalletModal: (v: boolean) => void;
  setShowDemoModal: (v: boolean) => void;
  setShowImportModal: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  currentView: 'landing',
  isLoading: false,
  activePanel: 'properties',
  selectedNodeId: null,
  isSidebarCollapsed: false,
  isDeploying: false,
  showWalletModal: false,
  showDemoModal: false,
  showImportModal: false,

  setView: (view) => set({ currentView: view }),
  setIsLoading: (v) => set({ isLoading: v }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  selectNode: (nodeId) =>
    set({ selectedNodeId: nodeId, activePanel: 'properties' }),
  toggleSidebar: () =>
    set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
  setIsDeploying: (v) => set({ isDeploying: v }),
  setShowWalletModal: (v) => set({ showWalletModal: v }),
  setShowDemoModal: (v) => set({ showDemoModal: v }),
  setShowImportModal: (v) => set({ showImportModal: v }),
}));
