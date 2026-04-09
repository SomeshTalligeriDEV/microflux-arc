import { create } from 'zustand';
import { AccountInfo, Asset } from '../types/algorand';

interface WalletState {
  account: AccountInfo | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setAccount: (account: AccountInfo | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  updateBalance: (balance: number) => void;
  updateAssets: (assets: Asset[]) => void;
  clear: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  account: null,
  isLoading: false,
  error: null,

  setAccount: (account) => {
    set({ account, error: null });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  setError: (error) => {
    set({ error, isLoading: false });
  },

  updateBalance: (balance) => {
    set((state) => ({
      account: state.account ? { ...state.account, balance } : null,
    }));
  },

  updateAssets: (assets) => {
    set((state) => ({
      account: state.account ? { ...state.account, assets } : null,
    }));
  },

  clear: () => {
    set({ account: null, isLoading: false, error: null });
  },
}));
