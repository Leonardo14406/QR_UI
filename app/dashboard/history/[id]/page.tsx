'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import QRCodeDetail from './QRCodeDetail';
import { QRCodeResponse } from '@/lib/api/qr.types';
import { qrApi } from '@/lib/api/qrClient';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function QRCodeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { accessToken, isLoading: isAuthLoading } = useAuth();
  const [qrCode, setQrCode] = useState<QRCodeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQrCode = async () => {
      if (!accessToken || !params?.id) {
        if (!isAuthLoading) {
          router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        }
        return;
      }

      try {
        setIsLoading(true);
        const data = await qrApi.getQRCode(params.id as string);
        setQrCode(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch QR code:', err);
        setError(err instanceof Error ? err.message : 'Failed to load QR code');
      } finally {
        setIsLoading(false);
      }
    };

    fetchQrCode();
  }, [accessToken, isAuthLoading, params?.id, router]);

  if (isAuthLoading || isLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-8">
        {qrCode ? (
          <QRCodeDetail qrCode={qrCode} />
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No QR code data available</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
