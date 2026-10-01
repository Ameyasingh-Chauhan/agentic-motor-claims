import { create } from "zustand";

/**
 * Auth state. Phase 1 has no backend yet, so the shell runs with a local preview
 * user (the developer account) to exercise role-dependent UI. Phase 2 replaces
 * `user` with the result of GET /api/auth/me.
 */
const PREVIEW_USER = {
  id: "u_002",
  username: "Ameya Chauhan",
  display_name: "Ameya Chauhan",
  role: "admin",
  is_developer: true,
  title: "Solution Developer",
  avatar: null,
};

export const useAuthStore = create((set) => ({
  user: PREVIEW_USER,
  status: "authenticated", // loading | authenticated | anonymous
  setUser: (user) => set({ user, status: user ? "authenticated" : "anonymous" }),
}));
