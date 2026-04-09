// stores/simulationStore.ts — Simulation state management
import { create } from 'zustand';
import type { SimulationResult } from '../types/simulation';

interface SimulationState {
  isSimulating: boolean;
  result: SimulationResult | null;
  error: string | null;

  startSimulation: () => void;
  setResult: (result: SimulationResult) => void;
  setError: (error: string) => void;
  clearSimulation: () => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  isSimulating: false,
  result: null,
  error: null,

  startSimulation: () =>
    set({ isSimulating: true, result: null, error: null }),

  setResult: (result) =>
    set({ isSimulating: false, result, error: null }),

  setError: (error) =>
    set({ isSimulating: false, error }),

  clearSimulation: () =>
    set({ isSimulating: false, result: null, error: null }),
}));
