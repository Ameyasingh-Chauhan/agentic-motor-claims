import { create } from "zustand";

export const useAuthStore = create((set) => ({
  user: null, status: "loading",
  setUser: (user) => set({ user, status: user ? "authenticated" : "anonymous" }),
  signOut: async () => { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); set({ user: null, status: "anonymous" }); },
}));
