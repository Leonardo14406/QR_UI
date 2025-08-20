'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, FileText, QrCode, Image, Loader2, ArrowRight, Trash2 } from 'lucide-react';
import { qrApi } from '@/lib/api/qrClient';
import { QRCodeResponse } from '@/lib/api/qr.types';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function HistoryPage() {
  const [history, setHistory] = useState<QRCodeResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchHistory = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await qrApi.getQRHistory();
      // The backend returns { items: QRCodeResponse[] }
      setHistory(response.items || []);
    } catch (error) {
      console.error('Failed to fetch QR history:', error);
      toast({
        title: 'Error',
        description: 'Failed to load QR code history. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Initial fetch
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Set up visibility change listener to refresh when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchHistory();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchHistory]);

  const getIcon = (type?: string) => {
    if (!type) return <QrCode className="w-5 h-5" />;
    
    switch (type.toLowerCase()) {
      case 'page':
        return <FileText className="w-5 h-5" />;
      case 'generic':
      default:
        return <QrCode className="w-5 h-5" />;
    }
  };

  const getStatusColor = (isValid?: boolean | null) => {
    if (isValid === undefined || isValid === null) return 'bg-gray-100 text-gray-800';
    return isValid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getStatusText = (isValid?: boolean | null) => {
    if (isValid === undefined || isValid === null) return 'Unknown';
    return isValid ? 'Valid' : 'Expired/Used';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return 'N/A';
    }
  };

  const getTitle = (item: QRCodeResponse) => {
    if (!item) return 'QR Code';
    if (item.title) return item.title;
    if (item.type === 'page') return 'Page QR Code';
    if (item.type === 'generic') return 'Simple QR Code';
    return 'QR Code';
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingId(id);
      await qrApi.deleteQRCode(id);
      
      // Update the UI by removing the deleted item
      setHistory(prev => prev.filter(item => item.id !== id));
      
      toast({
        title: 'Success',
        description: 'Item deleted successfully',
      });
    } catch (error) {
      console.error('Failed to delete QR code:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete item. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground flex items-center space-x-3">
            <History className="w-8 h-8 text-primary" />
            <span>History</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            View your recent activity and past items
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Your recent scans, creations, and activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No QR code history found. Create or scan a QR code to see it here.
                </div>
              ) : (
                history.map((item) => (
                  <Link 
                    href={`/dashboard/history/${item.id}`}
                    key={item.id}
                    className="block"
                  >
                    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors group">
                      <div className="flex items-center space-x-4">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                          {getIcon(item.type)}
                        </div>
                        <div>
                          <h3 className="font-medium group-hover:text-primary transition-colors">
                            {getTitle(item)}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(item.scannedAt || item.createdAt)}
                            {item.scanned ? ' • Scanned' : ' • Created'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Badge className={getStatusColor(item.isValid)}>
                          {getStatusText(item.isValid)}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                          onClick={(e) => handleDelete(e, item.id)}
                          disabled={deletingId === item.id}
                          aria-label="Delete item"
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                          )}
                        </Button>
                        <Button 
                          asChild 
                          variant="ghost" 
                          size="icon" 
                          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          aria-label="View details"
                        >
                          <Link href={`/dashboard/history/${item.id}`}>
                            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}