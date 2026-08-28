import API_BASE from "@/lib/api";
import React, { createContext, useState, useCallback, useEffect, ReactNode } from "react";
import axios from "axios";
import queryClient from "@/lib/queryClient";

export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: "admin" | "user";
  isBanned?: boolean;
  hasContributed?: boolean;
}

export interface AuthContextType {
  user: User | null;
  setUser: (user: User) => void;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
  deleteAccount: () => Promise<void>;
}

export interface SignupData {
  firstName: string;
  lastName: string;
  emailOrPhone: string;
  username: string;
  password: string;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(() => {
    // Clear any old localStorage auth tokens from the pre-cookie era
    localStorage.removeItem("authToken");
    const stored = localStorage.getItem("authUser");
    if (!stored) return null;
    try { return JSON.parse(stored); } catch { localStorage.removeItem("authUser"); return null; }
  });

  const setUser = useCallback((u: User) => {
    setUserState(u);
    localStorage.setItem("authUser", JSON.stringify(u));
  }, []);

  // Validate session on startup - refresh user data (including role) from the server
  useEffect(() => {
    if (!user) return;
    axios.get(`${API_BASE}/api/auth/me`).then((res) => {
      const fresh = { ...user, ...res.data };
      setUserState(fresh);
      localStorage.setItem("authUser", JSON.stringify(fresh));
    }).catch((err) => {
      const status = err?.response?.status;
      if (status === 401 || status === 403 || status === 404) {
        setUserState(null);
        localStorage.removeItem("authUser");
        queryClient.clear();
        // Also clear the stale auth_token cookie server-side
        axios.post(`${API_BASE}/api/auth/signout`, {}).catch(() => {});
      }
      // 502/503/504 = server still starting - keep cached user state, retry will happen naturally
    });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    if (!username || !password) throw new Error("Username and password are required");
    const response = await axios.post(
      `${API_BASE}/api/auth/signin`,
      { email: username, password },
      { headers: { "Content-Type": "application/json" } }
    );
    // Token is now in an HttpOnly cookie - just store user display data
    const { user: userData } = response.data;
    setUserState(userData);
    localStorage.setItem("authUser", JSON.stringify(userData));
  }, []);

  const signup = useCallback(async (_data: SignupData) => {
    // Signup is handled directly in SignUp.tsx
  }, []);

  const logout = useCallback(async () => {
    try {
      await axios.post(`${API_BASE}/api/auth/signout`, {});
    } catch {
      // Best-effort - clear local state regardless
    }
    setUserState(null);
    localStorage.removeItem("authUser");
    queryClient.clear();
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!user) throw new Error("No user logged in");
    await axios.delete(`${API_BASE}/api/auth/me/delete`);
    setUserState(null);
    localStorage.removeItem("authUser");
    queryClient.clear();
  }, [user]);

  const value: AuthContextType = {
    user,
    setUser,
    isAuthenticated: !!user,
    login,
    signup,
    logout,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
