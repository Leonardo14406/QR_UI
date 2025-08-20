import { DashboardLayout } from '@/components/layout/DashboardLayout';
import QRCodeDetail from './QRCodeDetail';
import { qrApi } from '@/lib/api/qrClient';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

// Server-side page with dynamic data
export const dynamic = 'force-dynamic';

export default async function QRCodeDetailPage({ 
  params 
}: { 
  params: { id: string } 
}) {
  let qrCode;
  let errorMessage: string | null = null;
  
  const cookieStore = cookies();
  const accessToken = cookieStore.get('accessToken')?.value;
  
  if (!accessToken) {
    redirect('/login?redirect=' + encodeURIComponent(`/dashboard/history/${params.id}`));
  }
  
  try {
    qrCode = await qrApi.getQRCode(params.id);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized')) {
        cookieStore.delete('accessToken');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
        }
        redirect('/login?session=expired&redirect=' + encodeURIComponent(`/dashboard/history/${params.id}`));
      }
      errorMessage = `Failed to load QR code: ${err.message}`;
    } else {
      errorMessage = 'An unknown error occurred while loading the QR code.';
    }
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-8">
        {errorMessage ? (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">
            <p className="font-bold">Error</p>
            <p>{errorMessage}</p>
          </div>
        ) : null}
        
        {qrCode ? (
          <QRCodeDetail qrCode={qrCode} />
        ) : (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
