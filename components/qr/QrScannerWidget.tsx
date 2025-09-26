"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DecodeHintType, NotFoundException } from "@zxing/library";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { QrCode, CheckCircle2, XCircle, Camera, Loader2 } from "lucide-react";

interface QrScannerWidgetProps {
  onDecoded: (text: string) => void;
  onClose: () => void;
}

/**
 * A robust scanner widget built on ZXing that works reliably on desktop and mobile.
 * - Device selection
 * - Torch toggle (when supported)
 * - Debounced/continuous scanning with cooldown to prevent duplicates
 */
export function QrScannerWidget({ onDecoded, onClose }: QrScannerWidgetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [isStarting, setIsStarting] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [continuous, setContinuous] = useState(true);

  // Cooldown/duplicate protection
  const lastCodeRef = useRef<string | null>(null);
  const lastScanAtRef = useRef<number>(0);
  const cooldownMsRef = useRef<number>(800);

  const enumerate = useCallback(async () => {
    const mediaDevices = await navigator.mediaDevices.enumerateDevices();
    const vids = mediaDevices.filter((d) => d.kind === "videoinput");
    setDevices(vids);
    if (!selectedDeviceId) {
      const env = vids.find((d) => /back|rear/i.test(d.label));
      setSelectedDeviceId(env?.deviceId || vids[0]?.deviceId || undefined);
    }
  }, [selectedDeviceId]);

  const stop = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {}
    controlsRef.current = null;
    codeReaderRef.current = null;
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks()?.forEach((t) => t.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.pause();
        videoRef.current.load();
      }
    } catch {}
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const applyTorch = useCallback(async (on: boolean) => {
    try {
      const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      const caps: any = track?.getCapabilities?.();
      if (!track || !caps || !caps.torch) return;
      await track.applyConstraints({ advanced: [{ torch: on }] as any });
      setTorchOn(on);
    } catch {}
  }, []);

  const start = useCallback(async () => {
    if (!videoRef.current) return;
    setIsStarting(true);
    try {
      // Hints for better performance
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints);
      codeReaderRef.current = reader;

      // Start decoding from selected device
      const controls = await reader.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current,
        (result, err, scannerControls, ..._extra) => {
          if (result?.getText) {
            const text = result.getText();
            const now = Date.now();
            if (
              lastCodeRef.current === text ||
              now - lastScanAtRef.current < cooldownMsRef.current
            ) {
              return;
            }
            lastCodeRef.current = text;
            lastScanAtRef.current = now;
            onDecoded(text);
            if (!continuous) {
              // Stop after first valid decode in single-shot mode
              scannerControls?.stop();
            }
          } else if (err && !(err instanceof NotFoundException)) {
            // Non-"not found" errors can be logged if needed
            // console.warn('Decode error:', err);
          }
        }
      );
      controlsRef.current = controls;

      // Torch support check
      try {
        const track = (videoRef.current.srcObject as MediaStream)?.getVideoTracks?.()[0];
        const caps: any = track?.getCapabilities?.();
        setTorchSupported(!!caps?.torch);
      } catch {}
    } finally {
      setIsStarting(false);
    }
  }, [onDecoded, selectedDeviceId, continuous]);

  useEffect(() => {
    enumerate();
    return () => stop();
  }, [enumerate, stop]);

  useEffect(() => {
    // re-start when device changes
    stop();
    start();
  }, [selectedDeviceId, start, stop]);

  // Visibility pause/resume
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        controlsRef.current?.stop();
      } else {
        start();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [start]);

  return (
    <div className="fixed inset-0 bg-black z-50">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        aria-label="Camera preview for QR scanning"
      />

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Instruction chip */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2">
          <div className="px-3 py-1 rounded-full bg-white/10 text-white text-sm backdrop-blur shadow">
            Point your camera at a QR code
          </div>
        </div>

        {/* Scan region */}
        <div className="relative w-80 h-80">
          <div className="absolute -inset-10 bg-black/50" />
          <div className="absolute inset-0 rounded-2xl outline outline-[9999px] outline-black/50" />
          <div className="absolute inset-0">
            {[
              "top-0 left-0 -translate-x-1/2 -translate-y-1/2 rotate-0",
              "top-0 right-0 translate-x-1/2 -translate-y-1/2 rotate-90",
              "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 -rotate-90",
              "bottom-0 right-0 translate-x-1/2 translate-y-1/2 rotate-180",
            ].map((pos, i) => (
              <div key={i} className={`absolute ${pos} w-14 h-14 border-t-4 border-l-4 border-white rounded-tl-2xl`} />
            ))}
          </div>
          <div className="absolute inset-3 overflow-hidden rounded-xl">
            <div className="absolute left-6 right-6 h-[3px] bg-emerald-400/90 animate-[scan_2s_linear_infinite] shadow-[0_0_12px_rgba(16,185,129,0.8)]" />
          </div>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={() => {
          stop();
          onClose();
        }}
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
              value={selectedDeviceId ?? ""}
              onChange={(e) => setSelectedDeviceId(e.target.value || undefined)}
            >
              {devices.length === 0 && <option value="">No cameras</option>}
              {devices.map((d) => (
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

          {/* Mode toggle */}
          <div className="bg-white/10 backdrop-blur rounded-lg p-2 text-white">
            <label className="text-xs opacity-80">Mode</label>
            <div className="mt-1 flex items-center gap-2">
              <Button
                type="button"
                variant={continuous ? "default" : "secondary"}
                onClick={() => setContinuous((v) => !v)}
              >
                {continuous ? "Continuous" : "Single-shot"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
