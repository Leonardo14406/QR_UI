
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

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);

  const [recentScans, setRecentScans] = useState<HumanReadableScan[]>([]);
  const [uploading, setUploading] = useState(false);

  const [status, setStatus] = useState<null | { type: "success" | "error" | "info"; message: string }>(null);

  // Prevent duplicate rapid validations on the same code
  const lastCodeRef = useRef<string | null>(null);

  const formatDate = useCallback((d?: string | null) => {
    if (!d) return "N/A";
    try {
      return new Date(d).toLocaleString();
    } catch {
      return "N/A";
    }
  }, []);

  const stopCamera = useCallback(() => {
    try {
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current.destroy();
        scannerRef.current = null;
      }
    } catch {}
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    } catch {}
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
    setIsCameraOpen(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  useEffect(() => {
    // Cleanup on unmount
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    // If user switches away from the camera tab, stop camera.
    if (activeTab !== "camera") {
      stopCamera();
    }
  }, [activeTab, stopCamera]);

  const enumerateVideoInputs = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter((d) => d.kind === "videoinput");
    setVideoInputs(videos);
    // Prefer environment-facing camera if available
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
      } catch {
        // Ignore failures, some browsers lie about support
      }
    }
  }, []);

  const openCamera = useCallback(async () => {
    try {
      await enumerateVideoInputs();
      setIsCameraOpen(true);
      setIsScanning(true);

      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : { facingMode: { ideal: "environment" } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // Torch capability?
        const track = stream.getVideoTracks()[0];
        const caps: any = track.getCapabilities?.();
        setTorchSupported(!!(caps && "torch" in caps && caps.torch));

        // Build scanner with a central scan region for perf & UX
        scannerRef.current = new QrScanner(
          videoRef.current,
          (res) => {
            if (!res?.data) return;
            if (isValidating) return; // avoid flooding
            if (lastCodeRef.current === res.data) return; // avoid same code spam
            lastCodeRef.current = res.data;
            handleValidate(res.data, "camera");
          },
          {
            highlightCodeOutline: true,
            highlightScanRegion: true,
            preferredCamera: "environment",
            // Central square region (2/3 of the smaller dimension)
            calculateScanRegion: (video) => {
              const s = Math.min(video.videoWidth, video.videoHeight);
              const size = Math.round((2 / 3) * s);
              return {
                x: Math.round((video.videoWidth - size) / 2),
                y: Math.round((video.videoHeight - size) / 2),
                width: size,
                height: size,
              };
            },
          }
        );

        await scannerRef.current.start();
      }
    } catch (err: any) {
      stopCamera();
      toast({
        title: "Camera Error",
        description: err?.message || "Unable to access camera. Check permissions and HTTPS.",
        variant: "destructive",
      });
    }
  }, [enumerateVideoInputs, selectedDeviceId, isValidating, stopCamera, toast]);

  const handleValidate = useCallback(
    async (code: string, source: "camera" | "upload") => {
      setIsValidating(true);
      setStatus(null);
      try {
        const data: ScanResult = await qrApi.validateQRCode(code);

        // Check if QR code is invalid or not found
        if (!data.qr?.isValid) {
          const message = data.message || 'This QR code is invalid or has already been used.';
          
          setStatus({ type: 'error', message });
          toast({
            title: 'Invalid Code',
            description: message,
            variant: 'destructive',
          });
          return;
        }

        // Check if QR code was already scanned in this session
        const alreadyScanned = recentScans.some(scan => 
          typeof scan.payload === 'string' 
            ? scan.payload === code 
            : scan.payload.content === code
        );
        
        if (alreadyScanned) {
          const message = 'This QR code has already been scanned in this session.';
          setStatus({ type: 'info', message });
          toast({
            title: 'Already Scanned',
            description: message,
            variant: 'default',
          });
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

        // Normalize payload to string for display
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
      } catch (error: any) {
        const msg = error?.message || "Failed to validate QR code.";
        setStatus({ type: "error", message: msg });
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        setIsValidating(false);
        // Let camera continue scanning, but don't spam the same code repeatedly
        if (source === "camera") {
          setTimeout(() => {
            lastCodeRef.current = null;
            setStatus(null);
          }, 1400);
        }
      }
    },
    [toast]
  );

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
        setStatus({ type: 'info', message: 'Processing image...' });
        
        let data: ScanResult;
        try {
          data = await qrApi.scanImage(file);
        } catch (error: any) {
          console.error('Scan error:', error);
          let errorMessage = 'Failed to process the image. Please try again.';
          
          // Try to extract error message from different possible locations
          if (typeof error?.response?.data === 'string') {
            errorMessage = error.response.data;
          } else if (error?.response?.data?.message) {
            errorMessage = error.response.data.message;
          } else if (error?.message) {
            errorMessage = error.message;
          }
          
          // Clean up any HTML tags from the error message
          errorMessage = errorMessage.replace(/<[^>]*>?/gm, '');
          
          setStatus({ type: 'error', message: errorMessage });
          toast({
            title: 'Scan Failed',
            description: errorMessage,
            variant: 'destructive',
          });
          return;
        }

        if (!data.qr || !data.humanReadable || data.qr.type !== "generic") {
          const msg = data.qr?.type === "page"
            ? "Page QR codes cannot be validated in-app."
            : data.message || "No valid QR code found in the image.";
          setStatus({ type: "error", message: msg });
          toast({ 
            title: "Scan Failed", 
            description: msg, 
            variant: "destructive" 
          });
          return;
        }

        // Normalize payload
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
        if (e?.currentTarget) {
          e.currentTarget.value = "";
        }
        setTimeout(() => setStatus(null), 1400);
      }
    },
    [toast]
  );

  const cameraControls = useMemo(() => {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {!isCameraOpen ? (
          <Button onClick={openCamera} className="gap-2">
            <Camera className="h-4 w-4" /> Start Camera
          </Button>
        ) : (
          <Button variant="destructive" onClick={stopCamera} className="gap-2">
            <StopCircle className="h-4 w-4" /> Stop
          </Button>
        )}

        <div className="relative">
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 pr-8 text-sm"
            disabled={!videoInputs.length}
          >
            {videoInputs.length === 0 ? (
              <option>Default camera</option>
            ) : (
              videoInputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.slice(0, 4)}`}
                </option>
              ))
            )}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
        </div>

        <Button
          variant={torchOn ? "default" : "outline"}
          onClick={() => applyTorch(!torchOn)}
          disabled={!torchSupported || !isCameraOpen}
          className="gap-2"
          title={torchSupported ? "Toggle flashlight" : "Flashlight not supported on this device"}
        >
          <Zap className="h-4 w-4" />
          Torch
        </Button>

        {isScanning && (
          <Button variant="outline" disabled className="gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning…
          </Button>
        )}
      </div>
    );
  }, [applyTorch, isCameraOpen, isScanning, torchOn, torchSupported, openCamera, stopCamera, selectedDeviceId, videoInputs.length]);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <ScanIcon className="w-8 h-8 text-primary" />
            Scan QR Code
          </h1>
          <p className="text-muted-foreground mt-1">
            Validate generic QR codes you created via camera or image upload.
          </p>
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
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-primary" />
                  Live Scan
                </CardTitle>
                <CardDescription>Align the QR within the frame. Brightness helps scan faster.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative w-full aspect-[16/10] bg-black rounded-xl overflow-hidden">
                  {/* Video feed */}
                  <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />

                  {/* Scan overlay */}
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="relative w-[70%] max-w-md aspect-square">
                      {/* dark mask */}
                      <div className="absolute -inset-8 bg-black/40 backdrop-blur-[1px]" />
                      {/* punch-out square */}
                      <div className="absolute inset-0 rounded-xl outline outline-[9999px] outline-black/40" />
                      {/* corner guides */}
                      <div className="absolute inset-0">
                        {[
                          "top-0 left-0 -translate-x-1/2 -translate-y-1/2 rotate-0",
                          "top-0 right-0 translate-x-1/2 -translate-y-1/2 rotate-90",
                          "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 -rotate-90",
                          "bottom-0 right-0 translate-x-1/2 translate-y-1/2 rotate-180",
                        ].map((pos, i) => (
                          <div
                            key={i}
                            className={`absolute ${pos} w-10 h-10 border-t-4 border-l-4 border-white/90 rounded-tl-xl`}
                          />
                        ))}
                      </div>
                      {/* animated scan line */}
                      <div className="absolute inset-2 overflow-hidden rounded-lg">
                        <div className="absolute left-0 right-0 h-0.5 bg-white/80 animate-[scan_2.2s_linear_infinite]"></div>
                      </div>
                    </div>
                  </div>

                  {/* Status banner */}
                  {status && (
                    <div
                      className={`absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-sm font-medium shadow ${
                        status.type === "success"
                          ? "bg-emerald-600 text-white"
                          : "bg-red-600 text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {status.type === "success" ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        <span>{status.message}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">{cameraControls}</div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* UPLOAD TAB */}
          <TabsContent value="upload">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  Upload Image
                </CardTitle>
                <CardDescription>Upload a clear image containing your QR code (PNG/JPG/GIF/WEBP).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border border-dashed rounded-xl p-6 text-center">
                  <QrCode className="mx-auto h-10 w-10 opacity-70 mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">
                    Choose a file with a visible QR code. Good contrast helps.
                  </p>
                  <input
                    id="qr-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onFileSelected}
                  />
                  <Button onClick={() => onChooseFile(document.getElementById("qr-upload") as HTMLInputElement)} disabled={uploading} className="gap-2">
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
              <div className="text-center py-8 text-muted-foreground">
                No scans yet. Start by scanning with the camera or upload an image.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {recentScans.map((scan) => (
                  <div
                    key={`${scan.id}-${scan.validatedAt || scan.createdAt}`}
                    className="border rounded-lg p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            scan.isValid ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {scan.isValid ? "Valid" : "Invalid"}
                        </span>
                        <span className="text-muted-foreground">Type:</span>
                        <span className="font-medium">Generic</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">One-time:</span>
                        <span className="font-medium">{scan.oneTime ? "Yes" : "No"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {scan.validatedAt ? `Validated ${formatDate(scan.validatedAt)}` : `Created ${formatDate(scan.createdAt)}`}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Creator:</span>
                        <span className="font-medium">{scan.creator || "Unknown"}</span>
                      </div>
                      {scan.expiresAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Expires:</span>
                          <span className="font-medium">{formatDate(scan.expiresAt)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Code:</span>
                        <span className="font-mono text-xs truncate max-w-[220px]" title={scan.code}>
                          {scan.code}
                        </span>
                      </div>
                    </div>

                    {scan.payload && (
                      <div className="mt-3 text-sm">
                        <div className="text-muted-foreground">Payload</div>
                        <pre className="mt-1 whitespace-pre-wrap break-words bg-muted/40 p-2 rounded text-foreground text-xs">
                          {typeof scan.payload === "string" ? scan.payload : JSON.stringify(scan.payload ?? "", null, 2)}
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

      {/* Little CSS keyframe for the scan line */}
      <style jsx global>{`
        @keyframes scan {
          0% { transform: translateY(0%); opacity: 0.2; }
          10% { opacity: 1; }
          50% { transform: translateY(calc(100% - 2px)); opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(0%); opacity: 0.2; }
        }
      `}</style>
    </DashboardLayout>
  );
}
