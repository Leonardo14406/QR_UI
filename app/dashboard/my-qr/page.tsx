'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { QrCode, Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface QRCode {
  id: string;
  name: string;
  createdAt: string;
  // Add other QR code properties as needed
}

export default function MyQRPage() {
  const { user } = useAuth();
  const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // TODO: Replace with actual API call to fetch QR codes
  useEffect(() => {
    const fetchQRCodes = async () => {
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500));
        // Set empty array for now - will be populated with actual data from API
        setQrCodes([]);
      } catch (error) {
        console.error('Failed to fetch QR codes:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQRCodes();
  }, []);

  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground flex items-center space-x-3">
            <QrCode className="w-8 h-8 text-primary" />
            <span>My QR Codes</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Your QR codes for receiving items
          </p>
        </div>
        
        <div className="space-y-6">
          {/* QR Codes List */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Your QR Codes</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 flex flex-col items-center justify-center text-muted-foreground">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                  <p>Loading your QR codes...</p>
                </div>
              ) : qrCodes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {qrCodes.map((qr) => (
                    <div key={qr.id} className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                      <div className="aspect-square bg-white p-2 rounded border flex items-center justify-center mb-3">
                        <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center">
                          <QrCode className="w-16 h-16 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="text-center">
                        <h3 className="font-medium">{qr.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          Created: {new Date(qr.createdAt).toLocaleDateString()}
                        </p>
                        <div className="flex justify-center gap-2 mt-2">
                          <Button variant="outline" size="sm" className="h-8">
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            Download
                          </Button>
                          <Button variant="outline" size="sm" className="h-8">
                            <Share2 className="w-3.5 h-3.5 mr-1.5" />
                            Share
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <QrCode className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-1">No QR codes available</h3>
                  <p className="text-muted-foreground max-w-md">
                    You don't have any QR codes assigned to your account yet.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How to use your QR codes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">1</div>
                  <div>
                    <h4 className="font-medium">Receive a QR code</h4>
                    <p className="text-sm text-muted-foreground">
                      QR codes are assigned by administrators or through the system.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">2</div>
                  <div>
                    <h4 className="font-medium">Present your QR code</h4>
                    <p className="text-sm text-muted-foreground">
                      When receiving items, show your QR code to the generator. They will scan it to log the transaction.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">3</div>
                  <div>
                    <h4 className="font-medium">Track your items</h4>
                    <p className="text-sm text-muted-foreground">
                      View your transaction history to see all items you've received using your QR codes.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
