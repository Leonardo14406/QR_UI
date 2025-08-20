'use client';

import { useRouter } from 'next/navigation';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, authService } from '@/lib/auth';

// Utility to set cookies client-side
function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Auto-refresh token mechanism
  useEffect(() => {
    let refreshInterval: NodeJS.Timeout;

    const scheduleTokenRefresh = () => {
      // Refresh token every 14 minutes (assuming 15-minute token expiry)
      refreshInterval = setInterval(async () => {
        if (accessToken) {
          try {
            const response = await authService.refreshToken();
            setAccessToken(response.accessToken);
          } catch (error) {
            console.error('Token refresh failed:', error);
            // If refresh fails, log out user
            setAccessToken(null);
            setUser(null);
          }
        }
      }, 14 * 60 * 1000); // 14 minutes
    };

    if (accessToken) {
      scheduleTokenRefresh();
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [accessToken]);

  const router = useRouter();

  // Helper function to redirect based on user role
  const redirectBasedOnRole = (user: User) => {
    if (!user) return;
    
    // Debug log to check user data
    console.log('User role check:', {
      intendedUse: user.intendedUse,
      hasGenerator: user.intendedUse?.includes('GENERATOR'),
      hasReceiver: user.intendedUse?.includes('RECEIVER')
    });

    // Only redirect if we're not already on the correct page
    const currentPath = window.location.pathname;
    const isGenerator = user.intendedUse?.includes('GENERATOR') ?? false;
    const targetPath = isGenerator ? '/dashboard' : '/dashboard/my-qr';
    
    console.log(`Redirecting ${user.email} (${isGenerator ? 'GENERATOR' : 'RECEIVER'}) to ${targetPath}`);
    
    if (currentPath !== targetPath) {
      // Use Next.js router for client-side navigation
      router.push(targetPath);
    }
  };

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Try to refresh token on app load
        const response = await authService.refreshToken();
        setAccessToken(response.accessToken);
        
        // Store token in localStorage for API client
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', response.accessToken);
        }
        
        // Get current user
        const currentUser = await authService.getCurrentUser(response.accessToken);
        setUser(currentUser);
        
        // Redirect based on user role
        redirectBasedOnRole(currentUser);
      } catch (error) {
        // No valid refresh token, user needs to log in
        console.log('No valid session found');
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
      
      // Get current user info
      const currentUser = await authService.getCurrentUser(response.accessToken);
      setUser(currentUser);
      
      // Redirect based on user role
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
      if (response.user) {
        setUser(response.user);
      } else {
        // Get current user info if not included in signup response
        const currentUser = await authService.getCurrentUser(response.accessToken);
        setUser(currentUser);
      }
    } catch (error) {
      throw error;
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}