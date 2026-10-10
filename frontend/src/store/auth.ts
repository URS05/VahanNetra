import { create } from "zustand";
import type { Role } from "../config";

const TOKEN_KEY = "pt_token";
const ROLE_KEY = "pt_role";

function readRole(value: string | null): Role | null {
  if (value === "viewer" || value === "analyst" || value === "admin") return value;
  return null;
}

type AuthState = {
  token: string | null;
  role: Role | null;
  setSession: (token: string, role: Role) => void;
  clear: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  token: sessionStorage.getItem(TOKEN_KEY),
  role: readRole(sessionStorage.getItem(ROLE_KEY)),
  setSession: (token, role) => {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(ROLE_KEY, role);
    set({ token, role });
  },
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    set({ token: null, role: null });
  },
}));
