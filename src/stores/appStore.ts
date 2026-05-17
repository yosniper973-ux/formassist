import { create } from "zustand";

interface AppState {
  // Centre actif
  activeCentreId: string | null;
  setActiveCentreId: (id: string | null) => void;

  // État de verrouillage
  isUnlocked: boolean;
  setUnlocked: (value: boolean) => void;

  // Connexion internet
  isOnline: boolean;
  setOnline: (value: boolean) => void;

  // Coût API cumulé du mois
  monthlyApiCost: number;
  setMonthlyApiCost: (cost: number) => void;
  addApiCost: (cost: number) => void;

  // Onboarding terminé
  onboardingComplete: boolean;
  setOnboardingComplete: (value: boolean) => void;

  // Mot de passe configuré
  passwordConfigured: boolean;
  setPasswordConfigured: (value: boolean) => void;

  // Thème
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeCentreId: null,
  setActiveCentreId: (id) => set({ activeCentreId: id }),

  isUnlocked: false,
  setUnlocked: (value) => set({ isUnlocked: value }),

  isOnline: navigator.onLine,
  setOnline: (value) => set({ isOnline: value }),

  monthlyApiCost: 0,
  setMonthlyApiCost: (cost) => set({ monthlyApiCost: cost }),
  addApiCost: (cost) =>
    set((state) => ({ monthlyApiCost: state.monthlyApiCost + cost })),

  onboardingComplete: false,
  setOnboardingComplete: (value) => set({ onboardingComplete: value }),

  passwordConfigured: false,
  setPasswordConfigured: (value) => set({ passwordConfigured: value }),

  theme: "light",
  setTheme: (t) => set({ theme: t }),
}));
