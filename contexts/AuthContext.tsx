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

// Utility: decode JWT expiry
function decodeJwt(token: string): { exp: number } {
  const decoded = jwtDecode<{ exp: number }>(token);
  return { exp: decoded.exp };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();

  const redirectBasedOnRole = (user: User) => {
    if (!user) return;
    const isGenerator = user.intendedUse?.includes('GENERATOR') ?? false;
    const targetPath = isGenerator ? '/dashboard' : '/dashboard/my-qr';
    if (pathname !== targetPath) router.push(targetPath);
  };

  // Schedule token refresh based on JWT expiry
  const scheduleTokenRefresh = (token: string) => {
    try {
      const { exp } = decodeJwt(token);
      const expiresIn = exp * 1000 - Date.now();
      const refreshAt = expiresIn - 60_000; // refresh 1 min early
      if (refreshAt > 0) {
        setTimeout(async () => {
          try {
            await refreshToken();
          } catch (err) {
            console.error('Token refresh failed:', err);
            await logout(); // auto-cleanup if refresh fails
          }
        }, refreshAt);
      }
    } catch (err) {
      console.error('Failed to decode token', err);
    }
  };

  /**
   * Refreshes the authentication token
   * @returns The new access token or null if refresh failed
   */
  const refreshToken = async (): Promise<string | null> => {
    try {
      const response = await authService.refreshAccessToken();
      const newToken = response.accessToken;
      
      if (!newToken) {
        throw new Error('No access token received during refresh');
      }

      setAccessToken(newToken);
      scheduleTokenRefresh(newToken);

      // Update user data if available in the response, otherwise fetch it
      if (response.user) {
        setUser(response.user);
      } else {
        const currentUser = await authService.getCurrentUser().catch(err => {
          console.warn('Failed to fetch user data after token refresh:', err);
          return null;
        });
        if (currentUser) setUser(currentUser);
      }

      return newToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Don't logout automatically on refresh failure to prevent redirect loops
      // The next API call will trigger a logout if needed
      return null;
    }
  };

  // Initialize auth on mount
  useEffect(() => {
    let isMounted = true;
    
    const initAuth = async () => {
      try {
        const refreshTokenValue = authService.getRefreshToken();
        if (refreshTokenValue) {
          await refreshToken();
        } else {
          console.debug('No refresh token found, user not authenticated');
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        // Don't redirect here to prevent flash of login page
        // The protected routes will handle redirection if needed
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initAuth();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authService.login(email, password);
    const token = response.accessToken ?? null;
    if (token) {
      setAccessToken(token);
      scheduleTokenRefresh(token);
      const currentUser = response.user ?? (await authService.getCurrentUser());
      setUser(currentUser);
      redirectBasedOnRole(currentUser);
    }
  };

  const signup = async (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    intendedUse: ('GENERATOR' | 'RECEIVER')[];
  }) => {
    const response = await authService.signup(data);
    const token = response.accessToken ?? null;
    if (token) {
      setAccessToken(token);
      scheduleTokenRefresh(token);
      const currentUser = response.user ?? (await authService.getCurrentUser());
      setUser(currentUser);
      redirectBasedOnRole(currentUser);
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
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
        const currentUser = await authService.getCurrentUser();
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
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
