// Estado de interface (Zustand): avisos, painéis abertos e preferências locais.

import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error' | 'warn';
  text: string;
}

interface UIState {
  toasts: Toast[];
  toast: (kind: Toast['kind'], text: string) => void;
  dismiss: (id: number) => void;
  biaOpen: boolean;
  setBia: (v: boolean) => void;
  gridDay: number;
  setGridDay: (d: number) => void;
  compareStation: string | null;
  setCompare: (id: string | null) => void;
  runOpen: boolean;
  setRunOpen: (v: boolean) => void;
  programSheet: string | null;
  openProgram: (id: string | null) => void;
  liveDay: number | null;
  setLiveDay: (d: number | null) => void;
  slotPx: number;
  setSlotPx: (n: number) => void;
}

let toastId = 0;

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function writePref(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // sem localStorage
  }
}

export const useUI = create<UIState>((set) => ({
  toasts: [],
  toast: (kind, text) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  biaOpen: false,
  setBia: (v) => set({ biaOpen: v }),
  gridDay: 0,
  setGridDay: (d) => set({ gridDay: d }),
  compareStation: null,
  setCompare: (id) => set({ compareStation: id }),
  runOpen: false,
  setRunOpen: (v) => set({ runOpen: v }),
  programSheet: null,
  openProgram: (id) => set({ programSheet: id }),
  liveDay: null,
  setLiveDay: (d) => set({ liveDay: d }),
  slotPx: readPref('ptm.slotPx', 16),
  setSlotPx: (n) => {
    writePref('ptm.slotPx', n);
    set({ slotPx: n });
  },
}));
