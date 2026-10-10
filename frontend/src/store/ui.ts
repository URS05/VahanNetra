import { create } from "zustand";

export type ToastTone = "info" | "ok" | "error";

export type Toast = {
  id: string;
  text: string;
  tone: ToastTone;
};

type UiState = {
  apiDown: boolean;
  sessionExpired: boolean;
  toasts: Toast[];
  setApiDown: (down: boolean) => void;
  expireSession: () => void;
  clearSessionExpired: () => void;
  pushToast: (text: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
};

export const useUi = create<UiState>((set) => ({
  apiDown: false,
  sessionExpired: false,
  toasts: [],
  setApiDown: (apiDown) => set({ apiDown }),
  expireSession: () => set({ sessionExpired: true }),
  clearSessionExpired: () => set({ sessionExpired: false }),
  pushToast: (text, tone = "info") =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text, tone },
      ],
    })),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
