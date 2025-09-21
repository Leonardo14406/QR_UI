// Scan/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { qrApi } from "@/lib/api/qrClient";
import type { ScanResult, HumanReadableScan } from "@/lib/api/qr.types";
import QrScanner from "qr-scanner";

// Configure worker path for qr-scanner so decoding works in the browser
// The worker file exists in `public/qr-scanner-worker.min.js`
QrScanner.WORKER_PATH = "/qr-scanner-worker.min.js";

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

export default function ScanPage() {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"camera" | "upload">("camera");

  // Camera/Scanner refs & state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);

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
    // Cancel any pending animation frames
    if (scanFrameRef.current) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    // Stop and clean up scanner
    if (scannerRef.current) {
      try {
        scannerRef.current.stop();
        scannerRef.current.destroy();
      } catch (error) {
        console.error('Error cleaning up scanner:', error);
      } finally {
        scannerRef.current = null;
      }
    }

    // Stop all media tracks
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          streamRef.current?.removeTrack(track);
        });
      } catch (error) {
        console.error('Error stopping media tracks:', error);
      } finally {
        streamRef.current = null;
      }
    }

    // Clean up video element
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current.load(); // Reset the video element
      } catch (error) {
        console.error('Error cleaning up video element:', error);
      }
    }

    // Reset states
    setIsScanning(false);
    setIsCameraActive(false);
    setScannerReady(false);
    setTorchOn(false);
    setTorchSupported(false);
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

  const enumerateVideoInputs = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter((d) => d.kind === "videoinput");
    setVideoInputs(videos);
    if (!selectedDeviceId) {
      const env = videos.find((d) => d.label.toLowerCase().includes("back") || d.label.toLowerCase().includes("rear"));
      setSelectedDeviceId(env?.deviceId ?? videos[0]?.deviceId);
    }
  }, [selectedDeviceId]);

  const applyTorch = useCallback(async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const caps: any = track.getCapabilities?.();
    if (caps && "torch" in caps && caps.torch) {
      try {
        await track.applyConstraints({ advanced: [{ torch: on }] as any });
        setTorchOn(on);
      } catch {}
    }
  }, []);

  const initializeScanner = useCallback(async (videoElement: HTMLVideoElement) => {
    if (!videoElement || scannerRef.current) return;

    try {
      // Configure video element
      videoElement.playsInline = true;
      videoElement.muted = true;
      videoElement.setAttribute('playsinline', 'true');
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'cover';

      // Create new scanner instance
      scannerRef.current = new QrScanner(
        videoElement,
        (result) => {
          if (!result?.data) {
            // No QR code detected in this frame
            return;
          }
          
          const nowTs = Date.now();
          if (
            isValidating ||
            lastCodeRef.current === result.data ||
            nowTs - lastScanAtRef.current < cooldownRef.current
          ) {
            return; // Skip if already validating or same code
          }
          
          lastCodeRef.current = result.data;
          lastScanAtRef.current = nowTs;
          handleValidate(result.data, "camera");
        },
        {
          highlightCodeOutline: true,
          highlightScanRegion: true,
          preferredCamera: selectedDeviceId ? undefined : 'environment',
          maxScansPerSecond: 10,
          returnDetailedScanResult: true,
          calculateScanRegion: (video) => {
            const size = Math.min(video.videoWidth, video.videoHeight) * 0.7;
            return {
              x: (video.videoWidth - size) / 2,
              y: (video.videoHeight - size) / 2,
              width: size,
              height: size,
            };
          },
          onDecodeError: (error) => {
            // Ignore 'No QR code found' errors as they're expected
            if (error !== 'No QR code found') {
              console.warn('QR Scanner decode error:', error);
            }
          },
        }
      );

      // Start the scanner
      await scannerRef.current.start();
      setScannerReady(true);
      
    } catch (error) {
      console.error('Scanner initialization error:', error);
      toast({
        title: 'Scanner Error',
        description: 'Failed to initialize QR scanner. Please try again.',
        variant: 'destructive',
      });
      stopCamera();
    }
  }, [isValidating, stopCamera, selectedDeviceId]);

  useEffect(() => {
    const onVisibilityChange = async () => {
      try {
        if (document.hidden) {
          await scannerRef.current?.stop();
        } else if (isCameraActive) {
          if (scannerRef.current) {
            await scannerRef.current.start();
          } else if (videoRef.current) {
            await initializeScanner(videoRef.current);
          }
        }
      } catch (e) {
        console.warn('Visibility resume error:', e);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isCameraActive, initializeScanner]);

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

  const openCamera = useCallback(async () => {
    // Clean up any existing camera/scanner
    stopCamera();
    
    try {
      setIsCameraActive(true);
      setIsScanning(true);
      
      // Ensure we have camera devices and that a camera is available
      await enumerateVideoInputs();
      const hasCam = await QrScanner.hasCamera();
      if (!hasCam) {
        throw new Error('No camera found on this device.');
      }
      
      // Request camera access
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { 
              deviceId: { exact: selectedDeviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              facingMode: undefined
            }
          : { 
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Set up video element
      if (!videoRef.current) {
        throw new Error('Video element not found');
      }
      
      videoRef.current.srcObject = stream;
      
      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        const onLoadedMetadata = () => {
          videoRef.current?.removeEventListener('loadedmetadata', onLoadedMetadata);
          resolve();
        };
        
        videoRef.current?.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      });
      
      await videoRef.current.play().catch(error => {
        console.error('Video play error:', error);
        throw new Error('Failed to start camera preview');
      });

      // Check for torch support
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        setTorchSupported(!!(capabilities as any)?.torch);
      }

      // Initialize scanner after video is ready
      if (videoRef.current) {
        await initializeScanner(videoRef.current);
      }
      
    } catch (err: any) {
      console.error('Camera initialization error:', err);
      const errorMessage = 
        err?.name === 'NotAllowedError' ? 'Camera access was denied. Please check your browser permissions.' :
        err?.name === 'NotFoundError' ? 'No camera found. Please connect a camera and try again.' :
        err?.message || 'Failed to access camera. Please try again.';
      
      stopCamera();
      toast({
        title: "Camera Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [enumerateVideoInputs, selectedDeviceId, isValidating, stopCamera, toast]);

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
              <div className="fixed inset-0 bg-black z-50">
                {/* Video feed */}
                <video 
                  ref={videoRef} 
                  className="w-full h-full object-cover" 
                  muted 
                  playsInline 
                  disablePictureInPicture
                  disableRemotePlayback
                  aria-label="Camera preview for QR code scanning"
                />

                {/* Scan frame */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-72 h-72">
                    <div className="absolute -inset-8 bg-black/50 backdrop-blur-[1px]" />
                    <div className="absolute inset-0 rounded-xl outline outline-[9999px] outline-black/50" />
                    <div className="absolute inset-0">
                      {[
                        "top-0 left-0 -translate-x-1/2 -translate-y-1/2 rotate-0",
                        "top-0 right-0 translate-x-1/2 -translate-y-1/2 rotate-90",
                        "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 -rotate-90",
                        "bottom-0 right-0 translate-x-1/2 translate-y-1/2 rotate-180",
                      ].map((pos, i) => (
                        <div key={i} className={`absolute ${pos} w-12 h-12 border-t-4 border-l-4 border-white rounded-tl-xl`} />
                      ))}
                    </div>
                    <div className="absolute inset-2 overflow-hidden rounded-lg">
                      <div className="absolute left-0 right-0 h-0.5 bg-green-400 animate-[scan_2s_linear_infinite]" />
                    </div>
                  </div>
                </div>

                {/* Close button */}
                <button
                  onClick={stopCamera}
                  className="absolute top-6 right-6 bg-red-600 text-white px-3 py-2 rounded-xl shadow"
                >
                  Close
                </button>

                {/* Controls bar */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Camera selector */}
                    <div className="bg-white/10 backdrop-blur rounded-lg p-2 text-white">
                      <label className="text-xs opacity-80">Camera</label>
                      <select
                        className="w-full bg-black/30 mt-1 p-2 rounded"
                        value={selectedDeviceId}
                        onChange={async (e) => {
                          const id = e.target.value || undefined;
                          setSelectedDeviceId(id);
                          // Restart camera with selected device
                          await openCamera();
                        }}
                      >
                        {videoInputs.length === 0 && <option value="">No cameras</option>}
                        {videoInputs.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Camera (${d.deviceId.slice(0, 6)})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Torch toggle */}
                    <div className="bg-white/10 backdrop-blur rounded-lg p-2 text-white flex flex-col">
                      <label className="text-xs opacity-80">Torch</label>
                      <Button
                        type="button"
                        variant={torchOn ? "default" : "secondary"}
                        className="mt-1"
                        disabled={!torchSupported}
                        onClick={() => applyTorch(!torchOn)}
                      >
                        {torchSupported ? (torchOn ? "Turn off" : "Turn on") : "Not supported"}
                      </Button>
                    </div>

                    {/* Continuous scanning */}
                    <div className="bg-white/10 backdrop-blur rounded-lg p-2 text-white">
                      <label className="text-xs opacity-80">Mode</label>
                      <div className="mt-1 flex items-center gap-2">
                        <Button
                          type="button"
                          variant={continuousScan ? "default" : "secondary"}
                          onClick={() => setContinuousScan((v) => !v)}
                        >
                          {continuousScan ? "Continuous" : "Single-shot"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status banner */}
                {status && (
                  <div
                    className={`absolute top-6 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-sm font-medium shadow ${
                      status.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {status.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      <span>{status.message}</span>
                    </div>
                  </div>
                )}
              </div>
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
                    onClick={openCamera} 
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
      </div>
    </DashboardLayout>
  );
}
