'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Menu, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface NavbarProps {
  onToggleSidebar: () => void;
}

export function Navbar({ onToggleSidebar }: NavbarProps) {
  const { user } = useAuth();
  const router = useRouter();

  const handleProfileClick = () => {
    router.push('/profile');
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between h-16 px-4">
        {/* Left side - Logo and mobile menu */}
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            className="lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-semibold text-lg hidden sm:block">AuthApp</span>
          </div>
        </div>

        {/* Right side - User profile */}
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            onClick={handleProfileClick}
            className="flex items-center space-x-2 hover:bg-gray-100"
          >
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary text-white text-sm">
                {user ? getInitials(user.firstName, user.lastName) : 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:block font-medium">
              {user ? `${user.firstName} ${user.lastName}` : 'User'}
            </span>
          </Button>
        </div>
      </div>
    </nav>
  );
}