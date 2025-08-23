'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink, CheckCircle, XCircle, Clock, FileText, Link as LinkIcon } from 'lucide-react';
import { QRCodeResponse } from '@/lib/api/qr.types';
import { format } from 'date-fns';

interface QRCodeDetailProps {
  qrCode: QRCodeResponse;
}

export default function QRCodeDetail({ qrCode }: QRCodeDetailProps) {
  const router = useRouter();
  const isPageQR = qrCode.type === 'page';
  const isValid = qrCode.isValid ?? true;
  const statusText = isValid ? 'Valid' : 'Expired/Used';
  const statusIcon = isValid ? (
    <CheckCircle className="h-4 w-4 text-green-500" />
  ) : (
    <XCircle className="h-4 w-4 text-red-500" />
  );

  const formatDate = (dateString: string | number | Date) => {
    try {
      return format(new Date(dateString), 'PPPpp');
    } catch (error) {
      return 'N/A';
    }
  };

  // Get the correct title and content based on QR type
  const getTitle = () => {
    if (qrCode.title) return qrCode.title;
    return isPageQR ? 'Page QR Code' : 'QR Code';
  };

  // Get the URL to display (only for page QR codes)
  const getUrl = () => {
    if (!isPageQR) return null;
    return typeof qrCode.payload === 'string' ? qrCode.payload : qrCode.payload?.content;
  };

  const url = getUrl();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          className="pl-0"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to History
        </Button>
        <div className="flex items-center space-x-2">
          {statusIcon}
          <span className="text-sm font-medium">{statusText}</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isPageQR ? <FileText className="h-5 w-5" /> : <LinkIcon className="h-5 w-5" />}
            {getTitle()}
          </CardTitle>
          <CardDescription>
            {isPageQR ? 'Page QR Code' : 'Generic QR Code'}
            {qrCode.scannedAt && (
              <span className="ml-2 flex items-center text-sm text-muted-foreground">
                <Clock className="mr-1 h-3 w-3" />
                Scanned on {formatDate(qrCode.scannedAt)}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Type</p>
              <p>{isPageQR ? 'Page QR Code' : 'Generic QR Code'}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p>{formatDate(qrCode.createdAt)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Creator</p>
              <p>{`${qrCode.creator?.firstName ?? ''} ${qrCode.creator?.lastName ?? ''}`.trim() || 'Unknown'}</p>
            </div>
            {qrCode.expiresAt && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Expires</p>
                <p>{formatDate(qrCode.expiresAt)}</p>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">One-time use</p>
              <p>{qrCode.oneTime ? 'Yes' : 'No'}</p>
            </div>
          </div>

          {isPageQR && url && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">URL</p>
              <div className="flex items-center">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-blue-600 hover:underline"
                >
                  <ExternalLink className="mr-1 h-4 w-4" />
                  {url}
                </a>
              </div>
            </div>
          )}

          {isPageQR && typeof qrCode.payload === 'object' && qrCode.payload && 'description' in qrCode.payload && qrCode.payload.description && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="whitespace-pre-line">{qrCode.payload.description}</p>
            </div>
          )}

          {!isPageQR && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Content</p>
              <div className="p-4 bg-muted/50 rounded-md">
                <pre className="whitespace-pre-wrap break-words">
                  {typeof qrCode.payload === 'string' 
                    ? qrCode.payload 
                    : JSON.stringify(qrCode.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
