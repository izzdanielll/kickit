'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

interface User {
  id: string;
  email: string;
  username: string;
  coins?: number;
  gems?: number;
  xp?: number;
  level?: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserCoinsGems: (coins?: number, gems?: number) => void;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = '/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
      } else {
        // Token invalid — clear
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // The public landing page does not need an authentication round trip.
  // Protected/auth pages restore the server-managed HttpOnly-cookie session.
  useEffect(() => {
    if (pathname === '/') {
      setIsLoading(false);
      return;
    }
    void fetchProfile();
  }, [fetchProfile, pathname]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }
      setUser(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      setError(null);
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({ email, username, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Registration failed');
        }
        if (data.verificationRequired) {
          setUser(null);
          return true;
        }
        setUser(data.user);
        return false;
      } catch (err: any) {
        setError(err.message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    setError(null);
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } finally {
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  const updateUserCoinsGems = useCallback((coins?: number, gems?: number) => {
    setUser((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        coins: coins !== undefined ? coins : prev.coins,
        gems: gems !== undefined ? gems : prev.gems,
      };
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        refreshUser: fetchProfile,
        updateUserCoinsGems,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
