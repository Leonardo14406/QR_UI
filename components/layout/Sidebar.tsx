'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { 
  Scan, 
  Plus, 
  History, 
  Settings, 
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useMemo } from 'react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const generatorSidebarItems = [
  { id: 'scan', label: 'Scan', icon: Scan, href: '/dashboard/scan' },
  { id: 'create', label: 'Create', icon: Plus, href: '/dashboard/create' },
  { id: 'history', label: 'History', icon: History, href: '/dashboard/history' },
  { id: 'settings', label: 'Settings', icon: Settings, href: '/dashboard/settings' },
];

const receiverSidebarItems = [
  { id: 'my-qr', label: 'My QR', icon: Scan, href: '/dashboard/my-qr' },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const sidebarItems = useMemo(() => {
    if (!user) return [];
    const isGenerator = user.intendedUse?.includes('GENERATOR');
    return isGenerator ? generatorSidebarItems : receiverSidebarItems;
  }, [user]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleNavigation = (href: string) => {
    router.push(href);
    onClose(); // Close mobile sidebar after navigation
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Mobile close button */}
      <div className="flex items-center justify-between p-4 lg:hidden">
        <span className="font-semibold text-lg">Menu</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          
          return (
            <Button
              key={item.id}
              variant={isActive ? "default" : "ghost"}
              onClick={() => handleNavigation(item.href)}
              className={cn(
                "w-full justify-start space-x-3 h-12",
                isActive && "bg-primary text-primary-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Button>
          );
        })}
      </nav>

      {/* Logout button */}
      <div className="p-4 border-t">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start space-x-3 h-12 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:pt-16 lg:bg-gray-50 lg:border-r lg:border-gray-200">
        <SidebarContent />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}