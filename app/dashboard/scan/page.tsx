'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Scan, Camera, Upload, StopCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { qrApi } from '@/lib/api/qrClient';
import jsQR from 'jsqr';

interface HumanReadable {
  id: string;
  code: string;
  payload: string;
  type: 'generic';
  oneTime: boolean;
  isValid: boolean;
  createdAt: string;
  validatedAt: string | null;
  expiresAt: string | null;
  creator: string;
}

interface ScanResult {
  qr: {
    id: string;
    code: string;
    payload: string | { content: string };
    type: string;
    oneTime: boolean;
    isValid: boolean;
    createdAt: string;
    validatedAt: string | null;
    expiresAt: string | null;
    creator: { firstName: string; lastName: string };
  } | null;
  message: string;
  humanReadable?: {
    id: string;
    code: string;
    payload: string;
    type: string;
    oneTime: boolean;
    isValid: boolean;
    createdAt: string;
    validatedAt: string | null;
    expiresAt: string | null;
    creator: string;
  };
}

export default function ScanPage() {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recentScans, setRecentScans] = useState<HumanReadable[]>([]);
  const lastDecodedRef = useRef<string | null>(null);
  const lastDecodeAtRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
    setIsCameraOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const validateCode = useCallback(async (code: string) => {
    try {
      const data: ScanResult = await qrApi.validateQRCode(code);
      if (!data.qr || !data.humanReadable || data.qr.type !== 'generic') {
        toast({
          title: data.qr?.type === 'page' ? 'Unsupported QR Code' : 'Validation Failed',
          description:
            data.qr?.type === 'page'
              ? 'Only generic QR codes created by you can be validated in-app. Scan page QR codes with a mobile device.'
              : data.message || 'Unable to validate QR code.',
          variant: 'destructive',
        });
        return;
      }

      // Ensure all required fields are present
      const humanReadable: HumanReadable = {
        id: data.humanReadable.id,
        code: data.humanReadable.code,
        payload: data.humanReadable.payload || 'N/A',
        type: 'generic',
        oneTime: data.humanReadable.oneTime,
        isValid: data.humanReadable.isValid,
        createdAt: data.humanReadable.createdAt,
        validatedAt: data.humanReadable.validatedAt,
        expiresAt: data.humanReadable.expiresAt,
        creator: data.humanReadable.creator || 'Unknown',
      };

      setRecentScans(prev => [humanReadable, ...prev].slice(0, 20));
      toast({
        title: 'QR Code Validated',
        description: `Payload: ${humanReadable.payload || 'N/A'}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to validate QR code.';
      console.error('[ScanPage] Validation error:', error);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    }
  }, [toast]);

  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = 640; // Fixed size for performance
    canvas.height = 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code?.data) {
      const now = Date.now();
      const cooldownMs = 2000;
      if (code.data !== lastDecodedRef.current || now - lastDecodeAtRef.current > cooldownMs) {
        lastDecodedRef.current = code.data;
        lastDecodeAtRef.current = now;
        console.log('[ScanPage] Detected QR code:', code.data);
        validateCode(code.data);
      }
    }

    rafRef.current = requestAnimationFrame(scanFrame);
  }, [validateCode, isScanning]);

  const openCamera = useCallback(async () => {
    try {
      setIsCameraOpen(true);
      setIsScanning(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      rafRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to access camera.';
      console.error('[ScanPage] Camera error:', error);
      setIsCameraOpen(false);
      setIsScanning(false);
      toast({
        title: 'Camera Error',
        description: message,
        variant: 'destructive',
      });
    }
  }, [scanFrame, toast]);

  const onChooseFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
  
    if (!/image\/(png|jpe?g)/i.test(file.type)) {
      toast({ title: 'Unsupported File', description: 'Please upload a PNG or JPEG image.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File Too Large', description: 'Image size exceeds 5MB limit.', variant: 'destructive' });
      return;
    }
  
    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise(resolve => { img.onload = resolve; });
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, 300, 300);
        const imageData = ctx.getImageData(0, 0, 300, 300);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (!code?.data) {
          toast({
            title: 'Invalid Image',
            description: 'No QR code detected in the uploaded image.',
            variant: 'destructive',
          });
          return;
        }
      }
      URL.revokeObjectURL(img.src);
    } catch (error) {
      console.error('[ScanPage] Client-side QR detection error:', error);
    }
  
    try {
      setIsUploading(true);
      const data: ScanResult = await qrApi.scanImage(file);
      if (!data.qr || !data.humanReadable || data.qr.type !== 'generic') {
        toast({
          title: data.qr?.type === 'page' ? 'Unsupported QR Code' : 'Scan Failed',
          description:
            data.qr?.type === 'page'
              ? 'Only generic QR codes created by you can be validated in-app. Scan page QR codes with a mobile device.'
              : data.message || 'Unable to process image.',
          variant: 'destructive',
        });
        return;
      }
  
      const humanReadable: HumanReadable = {
        id: data.humanReadable.id,
        code: data.humanReadable.code,
        payload: data.humanReadable.payload || 'N/A',
        type: 'generic',
        oneTime: data.humanReadable.oneTime,
        isValid: data.humanReadable.isValid,
        createdAt: data.humanReadable.createdAt,
        validatedAt: data.humanReadable.validatedAt,
        expiresAt: data.humanReadable.expiresAt,
        creator: data.humanReadable.creator || 'Unknown',
      };
  
      setRecentScans(prev => [humanReadable, ...prev].slice(0, 20));
      toast({ title: 'QR Code Validated', description: `Payload: ${humanReadable.payload || 'N/A'}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process image.';
      console.error('[ScanPage] File upload error:', error);
      toast({
        title: 'Error',
        description: message.includes('Malformed data')
          ? 'Invalid image data. Please upload a clear QR code image.'
          : message,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [toast]);

  const formatDate = (d?: string | null) => {
    if (!d) return 'N/A';
    try {
      return new Date(d).toLocaleString();
    } catch {
      return 'N/A';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground flex items-center space-x-3">
            <Scan className="w-8 h-8 text-primary" />
            <span>Scan</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Scan generic QR codes you created using your device camera or image upload
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Camera className="w-5 h-5 text-primary" />
                <span>Camera Scan</span>
              </CardTitle>
              <CardDescription>
                Use your device camera to scan generic QR codes you created
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="relative w-full aspect-video bg-black rounded-md overflow-hidden">
                  <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                  <canvas ref={canvasRef} className="hidden" width="640" height="480" />
                </div>
                <div className="flex gap-2">
                  {!isCameraOpen ? (
                    <Button className="w-full" onClick={openCamera}>
                      <Camera className="mr-2 h-4 w-4" /> Open Camera
                    </Button>
                  ) : (
                    <Button variant="destructive" className="w-full" onClick={stopCamera}>
                      <StopCircle className="mr-2 h-4 w-4" /> Stop Camera
                    </Button>
                  )}
                  {isScanning && (
                    <Button variant="outline" disabled className="w-28">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Upload className="w-5 h-5 text-primary" />
                <span>Upload Image</span>
              </CardTitle>
              <CardDescription>
                Upload a PNG or JPEG image containing a generic QR code you created
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={onFileSelected}
              />
              <Button variant="outline" className="w-full" onClick={onChooseFile} disabled={isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...
                  </>
                ) : (
                  'Choose File'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recent Scans</CardTitle>
            <CardDescription>
              Your recently scanned generic QR codes will appear here
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentScans.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No scans yet. Start by scanning a generic QR code you created.
              </div>
            ) : (
              <div className="space-y-4">
                {recentScans.map((scan) => (
                  <div key={`${scan.id}-${scan.validatedAt || scan.createdAt}`} className="rounded-md border p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type:</span>
                        <span className="font-medium">Generic</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valid:</span>
                        <span className="font-medium">{scan.isValid ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">One-time:</span>
                        <span className="font-medium">{scan.oneTime ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Created:</span>
                        <span className="font-medium">{formatDate(scan.createdAt)}</span>
                      </div>
                      {scan.validatedAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Validated:</span>
                          <span className="font-medium">{formatDate(scan.validatedAt)}</span>
                        </div>
                      )}
                      {scan.expiresAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Expires:</span>
                          <span className="font-medium">{formatDate(scan.expiresAt)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Creator:</span>
                        <span className="font-medium">{scan.creator || 'Unknown'}</span>
                      </div>
                    </div>
                    {scan.payload && (
                      <div className="mt-3 text-sm">
                        <div className="text-muted-foreground">Payload</div>
                        <pre className="mt-1 whitespace-pre-wrap break-words bg-muted/30 p-2 rounded text-foreground">
                          {scan.payload}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}