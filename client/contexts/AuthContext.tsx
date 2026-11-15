import API_BASE from "@/lib/api";
import React, { createContext, useState, useCallback, useEffect, ReactNode } from "react";
import axios from "axios";
import queryClient from "@/lib/queryClient";
import { forgetAcknowledgedDrafts } from "@/lib/draftScope";

export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: "admin" | "user";
  isBanned?: boolean;
  /** Has rated a manager. Gates manager data. */
  hasContributed?: boolean;
  /** Has rated a company. Gates workplace data - one gate per dataset. */
  hasRatedCompany?: boolean;
}

export interface AuthContextType {
  user: User | null;
  setUser: (user: User) => void;
  /**
   * Re-read the signed-in user from the server.
   *
   * Call this after anything that may have changed what the account is entitled to. Contributing
   * used to flip `hasContributed` locally on the assumption that a submitted rating always counts,
   * which stopped being true the moment ratings could be withheld pending verification: the client
   * unlocked the site while the server had held the rating and unlocked nothing.
   *
   * Asking beats guessing. The server decides entitlement, so it is the only thing that can say.
   */
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
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

  /** Pulls the authoritative account state, including role and what it has unlocked. */
  const refreshUser = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/auth/me`);
      setUserState((prev) => {
        const fresh = { ...(prev ?? {}), ...res.data } as User;
        localStorage.setItem("authUser", JSON.stringify(fresh));
        return fresh;
      });
    } catch {
      // Leave the session alone. The startup effect below owns signing somebody out on a 401;
      // a failed refresh after a write should not log them out mid-flow.
    }
  }, []);

  /*
    Validate the session on startup, and KEEP ASKING if the server could not answer.

    The cached user carries hasContributed, which is what every contribution gate on the site
    reads. It goes stale the moment somebody rates a manager in another tab or on another device,
    and this request is what refreshes it.

    It used to try exactly once, and a failed attempt was dismissed with "retry will happen
    naturally". Nothing retried. So a backend that was restarting, or a network blip, left the
    reader holding a stale `hasContributed: false` - every rating on the directory blurred, the
    whole site telling somebody who HAD contributed to go and contribute - until they happened to
    reload at a moment the server was up. A comment is not a retry.

    Bounded and backed off: four attempts over twelve seconds, then it stops. An unauthenticated
    answer is still final and still signs them out; only a server that could not answer is
    retried.
  */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let attempt = 0;
    const RETRY_DELAYS_MS = [1_000, 3_000, 8_000];

    const validate = () => {
      axios.get(`${API_BASE}/api/auth/me`).then((res) => {
        if (cancelled) return;
        const fresh = { ...user, ...res.data };
        setUserState(fresh);
        localStorage.setItem("authUser", JSON.stringify(fresh));
      }).catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 401 || status === 403 || status === 404) {
          setUserState(null);
          localStorage.removeItem("authUser");
          queryClient.clear();
          // Also clear the stale auth_token cookie server-side
          axios.post(`${API_BASE}/api/auth/signout`, {}).catch(() => {});
          return;
        }
        // 502/503/504, or no response at all: the server could not answer, which says nothing
        // about this session. Ask again.
        if (attempt < RETRY_DELAYS_MS.length) {
          const wait = RETRY_DELAYS_MS[attempt];
          attempt += 1;
          setTimeout(() => { if (!cancelled) validate(); }, wait);
        }
      });
    };

    validate();
    return () => { cancelled = true; };
  }, []);

  /*
    `login` IS GONE, and nothing replaced it in this file.

    It posted an email and a password to /api/auth/signin, which exchanged them with Auth0 using
    grant_type=password - forbidden by RFC 9700 section 2.4, because the password passes through
    our hands and the grant cannot carry PKCE.

    Signing in is now a navigation, not a function call: `startPasswordLogin` in client/lib/auth.ts
    sends the browser to Auth0's hosted page, and the session arrives through /auth/callback. There
    is deliberately no function here that takes a password, so none can be called by mistake.

    It had no callers when it was removed, which is worth recording: it was reachable only through
    a context value nothing destructured.
  */

  const signup = useCallback(async (_data: SignupData) => {
    // Signup is handled directly in SignUp.tsx
  }, []);

  const logout = useCallback(async () => {
    /*
      TWO REQUIREMENTS THAT PULL IN OPPOSITE DIRECTIONS, and both are mandatory.

      Nothing this account typed may be shown or submitted under another account on this browser.
      And nothing the server has not accepted may be thrown away merely because somebody signed
      out - an unacknowledged draft is the ONLY copy of those answers that exists.

      Account-scoped storage satisfies the first: a draft written while signed in lives under that
      account's key and is never read back for anybody else. So this only has to satisfy the
      second, and it does the narrow thing: forget the drafts the server has already accepted,
      because those can be fetched again on any device, and keep the rest where their rightful
      owner will find them.
    */
    const leaving = user?.id;
    try {
      await axios.post(`${API_BASE}/api/auth/signout`, {});
    } catch {
      // Best-effort - clear local state regardless
    }
    if (leaving) forgetAcknowledgedDrafts(leaving);
    setUserState(null);
    localStorage.removeItem("authUser");
    queryClient.clear();
  }, [user?.id]);

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
    refreshUser,
    isAuthenticated: !!user,
    signup,
    logout,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
