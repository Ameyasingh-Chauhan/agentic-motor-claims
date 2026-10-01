import { create } from "zustand";

/** Global overlay toggles (keyboard-shortcuts modal, command palette). */
export const useShortcutsStore = create((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
