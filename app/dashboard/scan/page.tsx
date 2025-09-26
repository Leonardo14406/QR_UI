// Scan/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { qrApi } from "@/lib/api/qrClient";
import type { ScanResult, HumanReadableScan, QRCodeResponse } from "@/lib/api/qr.types";
import { useAuth } from "@/contexts/AuthContext";

import {
  Camera,
  Upload,
  Loader2,
  StopCircle,
  CheckCircle2,
  XCircle,
  Zap,
  ChevronDown,
  Scan as ScanIcon,
  QrCode,
} from "lucide-react";

import type { Socket } from "socket.io-client";
import { QrScannerWidget } from "@/components/qr/QrScannerWidget";

export default function ScanPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"camera" | "upload">("camera");

  // Camera/Scanner refs & state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const [recentScans, setRecentScans] = useState<HumanReadableScan[]>([]);
  const [uploading, setUploading] = useState(false);

  const [status, setStatus] = useState<null | { type: "success" | "error" | "info"; message: string }>(null);

  // Continuous scanning controls
  const [continuousScan, setContinuousScan] = useState(true);
  const cooldownRef = useRef<number>(800); // ms between validations of different codes
  const lastScanAtRef = useRef<number>(0);

  // Prevent duplicate rapid validations on the same code
  const lastCodeRef = useRef<string | null>(null);

  // Detect mobile
  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }, []);

  const formatDate = useCallback((d?: string | null) => {
    if (!d) return "N/A";
    try {
      return new Date(d).toLocaleString();
    } catch {
      return "N/A";
    }
  }, []);

  const stopCamera = useCallback(() => {
    setIsScanning(false);
    setIsCameraActive(false);
    setScannerReady(false);
    lastCodeRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (activeTab !== "camera") {
      stopCamera();
    }
  }, [activeTab, stopCamera]);

  // Handle tab change to camera on mobile
  useEffect(() => {
    if (activeTab === "camera") {
      // Reset camera state when switching to camera tab
      stopCamera();
    }
  }, [activeTab, stopCamera]);

  const handleValidate = useCallback(
    async (code: string, source: "camera" | "upload") => {
      setIsValidating(true);
      setStatus(null);
      
      // Optional debug: console.debug("Scanned Code:", code);

      try {
        const data: ScanResult = await qrApi.validateQRCode(code);
        
        if (!data.qr?.isValid) {
          const message = data.message || "This QR code is invalid or has already been used.";
          setStatus({ type: "error", message });
          toast({ title: "Invalid Code", description: message, variant: "destructive" });
          return;
        }

        if (!data.qr || !data.humanReadable || data.qr.type !== "generic") {
          const msg =
            data.qr?.type === "page"
              ? "Page QR codes cannot be validated in-app."
              : data.message || "Invalid or unsupported QR code.";
          setStatus({ type: "error", message: msg });
          toast({ title: "Validation Failed", description: msg, variant: "destructive" });
          return;
        }

        const payloadStr =
          typeof data.humanReadable.payload === "string"
            ? data.humanReadable.payload
            : data.humanReadable.payload?.content ??
              (data.humanReadable.payload ? JSON.stringify(data.humanReadable.payload) : "N/A");

        const humanReadable: HumanReadableScan = {
          id: data.humanReadable.id,
          code: data.humanReadable.code,
          payload: payloadStr,
          type: "generic",
          oneTime: data.humanReadable.oneTime,
          isValid: data.humanReadable.isValid,
          createdAt: data.humanReadable.createdAt,
          validatedAt: data.humanReadable.validatedAt,
          expiresAt: data.humanReadable.expiresAt,
          creator: data.humanReadable.creator || "Unknown",
        };

        setRecentScans((prev) => [humanReadable, ...prev].slice(0, 20));
        setStatus({ type: "success", message: "QR code validated" });
        toast({ title: "QR Validated", description: `Payload: ${humanReadable.payload || "N/A"}` });

        // In continuous mode, keep camera running; otherwise close after a successful scan
        if (source === "camera" && !continuousScan) stopCamera();
      } catch (error: any) {
        const msg = error?.message || "Failed to validate QR code.";
        setStatus({ type: "error", message: msg });
        // Show error in toast with full error details
        toast({ 
          title: "Validation Error", 
          description: `Error: ${msg}${error?.response?.data ? `\n\n${JSON.stringify(error.response.data, null, 2)}` : ''}`, 
          variant: "destructive" 
        });
      } finally {
        setIsValidating(false);
        // Allow the same code to be scanned again after cooldown
        setTimeout(() => {
          if (lastCodeRef.current === code) {
            lastCodeRef.current = null;
          }
        }, cooldownRef.current);
      }
    },
    [toast, stopCamera, continuousScan]
  );

  const onDecodedFromCamera = useCallback(async (raw: string) => {
    // Reuse existing validation flow
    await handleValidate(raw, "camera");
  }, [handleValidate]);

  const socketRef = useRef<Socket | null>(null);

  // Real-time: connect to backend Socket.IO to receive QR events
  useEffect(() => {
    if (!accessToken) return;
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5555";

    let mounted = true;
    let localSocket: Socket | null = null;
    (async () => {
      // Dynamic import ensures the browser build is used and avoids ws optional deps errors
      const { io } = await import("socket.io-client");
      if (!mounted) return;
      const socket = io(API_BASE_URL, {
        transports: ["websocket"],
        auth: { token: accessToken },
        withCredentials: true,
      });
      socketRef.current = socket;
      localSocket = socket;

      socket.on("connect", () => {
        // console.debug('[socket] connected', socket.id);
      });

      socket.on("qr:new", (payload: any) => {
        const hr = payload?.humanReadable;
        const qr = payload?.qr as QRCodeResponse | undefined;
        toast({ title: "New QR Generated", description: hr?.code || qr?.code || "New QR available" });
        if (qr && qr.type === 'generic' && qr.isValid) {
          setActiveQrs((prev) => [qr, ...prev.filter(x => x.id !== qr.id)]);
        }
      });

      socket.on("qr:validated", (payload: any) => {
        const hr = payload?.humanReadable;
        const qr = payload?.qr as QRCodeResponse | undefined;
        if (hr) {
          setRecentScans((prev) => [hr, ...prev].slice(0, 20));
          toast({ title: "QR Validated", description: `Code: ${hr.code}` });
        }
        // If a one-time code was validated or code became invalid, remove from active list
        if (qr) {
          setActiveQrs((prev) => prev.filter(x => x.id !== qr.id && x.code !== qr.code));
        }
      });
    })();

    return () => {
      mounted = false;
      if (localSocket) {
        localSocket.off("qr:new");
        localSocket.off("qr:validated");
        localSocket.disconnect();
      }
      socketRef.current = null;
    };
  }, [accessToken, toast]);

  // Fetch Active QR Codes on load
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await qrApi.getActive();
        if (!mounted) return;
        setActiveQrs(res.items || []);
      } catch (e: any) {
        console.warn('Failed to load active QR codes:', e?.message || e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const [activeQrs, setActiveQrs] = useState<QRCodeResponse[]>([]);

  const onChooseFile = useCallback((input: HTMLInputElement | null) => input?.click(), []);

  const onFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!/image\/(png|jpe?g|gif|webp)/i.test(file.type)) {
        toast({ title: "Unsupported File", description: "Please upload an image (PNG/JPG/GIF/WEBP).", variant: "destructive" });
        e.currentTarget.value = "";
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast({ title: "File Too Large", description: "Image exceeds 8MB limit.", variant: "destructive" });
        e.currentTarget.value = "";
        return;
      }

      try {
        setUploading(true);
        setStatus({ type: "info", message: "Processing image..." });

        const data: ScanResult = await qrApi.scanImage(file);

        if (!data.qr || !data.humanReadable || data.qr.type !== "generic") {
          const msg = data.qr?.type === "page"
            ? "Page QR codes cannot be validated in-app."
            : data.message || "No valid QR code found in the image.";
          setStatus({ type: "error", message: msg });
          toast({ title: "Scan Failed", description: msg, variant: "destructive" });
          return;
        }

        const payloadStr =
          typeof data.humanReadable.payload === "string"
            ? data.humanReadable.payload
            : data.humanReadable.payload?.content ??
              (data.humanReadable.payload ? JSON.stringify(data.humanReadable.payload) : "N/A");

        const humanReadable: HumanReadableScan = {
          id: data.humanReadable.id,
          code: data.humanReadable.code,
          payload: payloadStr,
          type: "generic",
          oneTime: data.humanReadable.oneTime,
          isValid: data.humanReadable.isValid,
          createdAt: data.humanReadable.createdAt,
          validatedAt: data.humanReadable.validatedAt,
          expiresAt: data.humanReadable.expiresAt,
          creator: data.humanReadable.creator || "Unknown",
        };

        setRecentScans((prev) => [humanReadable, ...prev].slice(0, 20));
        setStatus({ type: "success", message: "QR from image validated" });
        toast({ title: "QR Validated", description: `Payload: ${humanReadable.payload || "N/A"}` });
      } catch (error: any) {
        const msg = error?.message || "Failed to process image.";
        setStatus({ type: "error", message: msg });
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        setUploading(false);
        if (e?.currentTarget) e.currentTarget.value = "";
        setTimeout(() => setStatus(null), 1400);
      }
    },
    [toast]
  );

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <ScanIcon className="w-8 h-8 text-primary" />
            Scan QR Code
          </h1>
          <p className="text-muted-foreground mt-1">Validate generic QR codes via camera or image upload.</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="camera" className="gap-2">
              <Camera className="h-4 w-4" /> Camera
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" /> Upload
            </TabsTrigger>
          </TabsList>

          {/* CAMERA TAB */}
          <TabsContent value="camera" className="space-y-4">
            {isCameraActive ? (
              <QrScannerWidget onDecoded={onDecodedFromCamera} onClose={stopCamera} />
            ) : (
              <Card className="p-6">
                <div className="space-y-4 text-center">
                  <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                    <Camera className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium">Camera Scanner</h3>
                  <p className="text-muted-foreground text-sm">
                    Scan QR codes using your device's camera. You'll be asked for camera permissions.
                  </p>
                  <Button 
                    onClick={() => setIsCameraActive(true)}
                    className="w-full mt-4"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Start Camera
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* UPLOAD TAB */}
          <TabsContent value="upload">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  Upload Image
                </CardTitle>
                <CardDescription>Upload a clear image containing your QR code.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border border-dashed rounded-xl p-6 text-center">
                  <QrCode className="mx-auto h-10 w-10 opacity-70 mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">
                    Choose a file with a visible QR code. Good contrast helps.
                  </p>
                  <input id="qr-upload" type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
                  <Button
                    onClick={() => onChooseFile(document.getElementById("qr-upload") as HTMLInputElement)}
                    disabled={uploading}
                    className="gap-2"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" /> Choose Image
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* RECENT SCANS */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recent Scans</CardTitle>
            <CardDescription>Latest validations (max 20)</CardDescription>
          </CardHeader>
          <CardContent>
            {recentScans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scans yet.</p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                {recentScans.map((scan) => (
                  <div
                    key={scan.id}
                    className="p-3 rounded-lg border bg-card text-card-foreground shadow-sm hover:bg-accent/30"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 font-medium">
                        {scan.isValid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        {scan.code}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(scan.validatedAt)}</span>
                    </div>
                    <p className="text-sm">
                      {typeof scan.payload === 'string' 
                        ? scan.payload 
                        : scan.payload.content || 'No content available'}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Creator: {scan.creator}</span>
                      <span>•</span>
                      <span>{scan.oneTime ? "One-time" : "Reusable"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ACTIVE QR CODES */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Active QR Codes</CardTitle>
            <CardDescription>Valid, non-expired generic codes</CardDescription>
          </CardHeader>
          <CardContent>
            {activeQrs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active codes.</p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                {activeQrs.map(qr => (
                  <div key={qr.id} className="p-3 rounded-lg border bg-card text-card-foreground shadow-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 font-medium">
                        <QrCode className="h-4 w-4 text-primary" />
                        {qr.code}
                      </div>
                      <span className="text-xs text-muted-foreground">Created {formatDate(qr.createdAt)}</span>
                    </div>
                    <p className="text-sm">
                      {typeof qr.payload === 'string' ? qr.payload : (qr.payload as any)?.content || 'N/A'}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{qr.oneTime ? "One-time" : "Reusable"}</span>
                      {qr.expiresAt && (<><span>•</span><span>Expires {formatDate(qr.expiresAt)}</span></>)}
                    </div>
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
