'use client';

import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Sparkles, User } from 'lucide-react';

export default function Dashboard() {
  const { user, accessToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!accessToken) {
      router.push('/login');
    } else if (user && !user.intendedUse?.includes('GENERATOR')) {
      // Redirect RECEIVER users to their dedicated page
      router.push('/dashboard/my-qr');
    }
  }, [accessToken, router, user]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Welcome back, {user.firstName}!
          </h1>
          <p className="text-muted-foreground mt-2">
            Here's what's happening with your account
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex flex-wrap gap-2">
            {user?.intendedUse?.map((use) => (
              <Badge key={use} variant="secondary" className="flex items-center space-x-1">
                {use === 'GENERATOR' ? (
                  <Sparkles className="w-3 h-3" />
                ) : (
                  <User className="w-3 h-3" />
                )}
                <span>{use.toLowerCase()}</span>
              </Badge>
            )) || (
              <p className="text-sm text-muted-foreground">No usage preferences set</p>
            )}
          </div>
          <p className="text-muted-foreground">
            Select a tab from the sidebar to get started with the application.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}