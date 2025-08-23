'use client';

import { useRouter, usePathname } from 'next/navigation';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { jwtDecode } from 'jwt-decode';
import { User, authService } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    intendedUse: ('GENERATOR' | 'RECEIVER')[];
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Utility: decode JWT expiry using robust library
function decodeJwt(token: string): { exp: number } {
  try {
    const decoded = jwtDecode<{ exp: number }>(token);
    return { exp: decoded.exp };
  } catch (e) {
    throw new Error('Invalid JWT token');
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();

  // Redirect helper
  const redirectBasedOnRole = (user: User) => {
    if (!user) return;
    const isGenerator = user.intendedUse?.includes('GENERATOR') ?? false;
    const targetPath = isGenerator ? '/dashboard' : '/dashboard/my-qr';
    if (pathname !== targetPath) {
      router.push(targetPath);
    }
  };

  // Schedule token refresh based on JWT exp
  const scheduleTokenRefresh = (token: string) => {
    try {
      const { exp } = decodeJwt(token);
      const expiresIn = exp * 1000 - Date.now();
      const refreshAt = expiresIn - 60_000; // refresh 1 min early
      if (refreshAt > 0) {
        setTimeout(async () => {
          try {
            const response = await authService.refreshToken();
            setAccessToken(response.accessToken);
            scheduleTokenRefresh(response.accessToken); // reschedule
          } catch (err) {
            console.error('Token refresh failed:', err);
            setAccessToken(null);
            setUser(null);
          }
        }, refreshAt);
      }
    } catch (err) {
      console.error('Failed to decode token', err);
    }
  };

  // Centralized token refresh function
  const refreshToken = async (): Promise<string | null> => {
    try {
      const response = await authService.refreshToken();
      if (response?.accessToken) {
        // Store the token in localStorage for fetchWithAuth
        localStorage.setItem("accessToken", response.accessToken);
        
        // Update state
        setAccessToken(response.accessToken);
        scheduleTokenRefresh(response.accessToken);
        
        // Update user data
        try {
          const currentUser = await authService.getCurrentUser(response.accessToken);
          setUser(currentUser);
        } catch (userError) {
          console.error('Failed to fetch user data:', userError);
          // Don't fail the whole refresh if user fetch fails
        }
        
        return response.accessToken;
      }
      return null;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Clear any invalid tokens
      localStorage.removeItem("accessToken");
      setAccessToken(null);
      setUser(null);
      return null;
    }
  };

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        await refreshToken();
      } catch (err) {
        console.log('No valid session found');
        setUser(null);
        setAccessToken(null);
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await authService.login(email, password);
      setAccessToken(response.accessToken);
      scheduleTokenRefresh(response.accessToken);

      const currentUser = await authService.getCurrentUser(response.accessToken);
      setUser(currentUser);

      redirectBasedOnRole(currentUser);
    } catch (error) {
      throw error;
    }
  };

  const signup = async (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    intendedUse: ('GENERATOR' | 'RECEIVER')[];
  }) => {
    try {
      const response = await authService.signup(data);
      setAccessToken(response.accessToken);
      scheduleTokenRefresh(response.accessToken);

      const currentUser = response.user 
        ? response.user 
        : await authService.getCurrentUser(response.accessToken);
      setUser(currentUser);

      redirectBasedOnRole(currentUser);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout(); // backend clears refresh cookie
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setAccessToken(null);
      setUser(null);
      router.push('/login');
    }
  };

  const refreshUser = async () => {
    if (accessToken) {
      try {
        const currentUser = await authService.getCurrentUser(accessToken);
        setUser(currentUser);
      } catch (error) {
        console.error('Failed to refresh user:', error);
      }
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        login,
        signup,
        logout,
        refreshUser,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
