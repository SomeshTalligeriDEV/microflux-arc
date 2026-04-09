import { create } from 'zustand';
import { SimulationResult, SimulationStatus, SimulationStep } from '../types/simulation';

interface SimulationState {
  status: SimulationStatus;
  steps: SimulationStep[];
  totalFees: number;
  error: string | null;
  lastResult: SimulationResult | null;
  
  // Actions
  startSimulation: () => void;
  setSteps: (steps: SimulationStep[]) => void;
  updateStepStatus: (stepIndex: number, status: SimulationStep['status'], error?: string) => void;
  completeSimulation: (success: boolean, totalFees: number) => void;
  failSimulation: (error: string) => void;
  resetSimulation: () => void;
  saveResult: (result: SimulationResult) => void;
  getLastResult: () => SimulationResult | null;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  status: 'idle',
  steps: [],
  totalFees: 0,
  error: null,
  lastResult: null,

  startSimulation: () => {
    set({
      status: 'running',
      steps: [],
      totalFees: 0,
      error: null,
    });
  },

  setSteps: (steps) => {
    set({
      steps,
      totalFees: steps.reduce((sum, s) => sum + s.fee, 0),
    });
  },

  updateStepStatus: (stepIndex, status, error) => {
    const { steps } = get();
    if (steps[stepIndex]) {
      const newSteps = [...steps];
      newSteps[stepIndex] = { ...newSteps[stepIndex], status, error };
      set({ steps: newSteps });
    }
  },

  completeSimulation: (success, totalFees) => {
    set({
      status: success ? 'success' : 'error',
      totalFees,
    });
  },

  failSimulation: (error) => {
    set({
      status: 'error',
      error,
    });
  },

  resetSimulation: () => {
    set({
      status: 'idle',
      steps: [],
      totalFees: 0,
      error: null,
    });
  },

  saveResult: (result) => {
    set({ lastResult: result });
  },

  getLastResult: () => {
    return get().lastResult;
  },
}));
