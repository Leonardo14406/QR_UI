"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { DecodeHintType, NotFoundException } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { QrCode } from "lucide-react";

interface QrScannerWidgetProps {
  onDecoded: (text: string) => void;
  onClose: () => void;
  paused?: boolean;
}

/**
 * ZXing-based scanner widget with:
 * - Device selection
 * - Torch toggle (when supported)
 * - High-resolution constraints (improves printed ticket scans)
 * - Zoom slider (when supported)
 * - Debounce to prevent duplicate decodes
 */
export function QrScannerWidget({ onDecoded, onClose, paused = false }: QrScannerWidgetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>();
  const [isStarting, setIsStarting] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [continuous, setContinuous] = useState(true);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoom, setZoom] = useState<number | undefined>(undefined);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);

  // Cooldown/duplicate protection
  const lastCodeRef = useRef<string | null>(null);
  const lastScanAtRef = useRef<number>(0);
  const cooldownMsRef = useRef<number>(800);

  // Region-of-interest (ROI): accept only codes whose centroid lies in the central square
  // The fraction represents the size of the central square relative to the smaller video dimension
  const roiFractionRef = useRef<number>(0.6);

  const isInRoi = useCallback(() => {
    const video = videoRef.current;
    const vw = video?.videoWidth || video?.clientWidth || 0;
    const vh = video?.videoHeight || video?.clientHeight || 0;
    if (!vw || !vh) {
      // If unknown, don't block: allow all detections
      return (_cx: number, _cy: number) => true;
    }
    const size = Math.min(vw, vh) * roiFractionRef.current;
    const x0 = (vw - size) / 2;
    const y0 = (vh - size) / 2;
    const x1 = x0 + size;
    const y1 = y0 + size;
    return (cx: number, cy: number) => cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
  }, []);

  const enumerate = useCallback(async () => {
    const mediaDevices = await navigator.mediaDevices.enumerateDevices();
    const vids = mediaDevices.filter((d) => d.kind === "videoinput");
    setDevices(vids);
    if (!selectedDeviceId) {
      const env = vids.find((d) => /back|rear|environment/i.test(d.label));
      setSelectedDeviceId(env?.deviceId || vids[0]?.deviceId);
    }
  }, [selectedDeviceId]);

  const stop = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {}
    controlsRef.current = null;

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
    setZoom(undefined);
    setZoomSupported(false);
    setZoomRange(null);
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

  const applyZoom = useCallback(async (value: number) => {
    try {
      const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      const caps: any = track?.getCapabilities?.();
      if (!track || !caps || !("zoom" in caps)) return;
      await track.applyConstraints({ advanced: [{ zoom: value }] as any });
      setZoom(value);
    } catch {}
  }, []);

  const start = useCallback(async () => {
    if (!videoRef.current) return;
    setIsStarting(true);
    try {
      // Hints for better performance on printed codes
      const hints = new Map<DecodeHintType, any>();
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints);

      // High-res constraints help with printed small modules
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? ({
              deviceId: { exact: selectedDeviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
              advanced: [
                { focusMode: "continuous" as any },
                { exposureMode: "continuous" as any },
              ],
            } as unknown as MediaTrackConstraints)
          : ({
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
              advanced: [
                { focusMode: "continuous" as any },
                { exposureMode: "continuous" as any },
              ],
            } as unknown as MediaTrackConstraints),
        audio: false,
      };

      // Use decodeFromConstraints to pass our media constraints
      const controls = await reader.decodeFromConstraints(
        constraints as any,
        videoRef.current,
        (result, err, c) => {
          if (result?.getText) {
            // ROI filter: only accept if centroid lies within central square
            const pts = (result as any).getResultPoints?.() as Array<{ getX: () => number; getY: () => number }> | undefined;
            if (pts && pts.length) {
              const cx = pts.reduce((s, p) => s + p.getX(), 0) / pts.length;
              const cy = pts.reduce((s, p) => s + p.getY(), 0) / pts.length;
              const within = isInRoi()(cx, cy);
              if (!within) {
                return; // ignore detections outside ROI
              }
            }

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
            // If not in continuous mode, stop scanning after a valid in-ROI detection
            if (!continuous) {
              c?.stop();
            }
          } else if (err && !(err instanceof NotFoundException)) {
            // console.warn('Decode error:', err);
          }
        }
      );
      controlsRef.current = controls;

      // Capability checks for torch & zoom
      try {
        const track = (videoRef.current.srcObject as MediaStream)?.getVideoTracks?.()[0];
        const caps: any = track?.getCapabilities?.();
        if (caps) {
          setTorchSupported(!!caps.torch);
          if (typeof caps.zoom === "number") {
            setZoomSupported(true);
            setZoomRange({ min: 1, max: caps.zoom, step: 0.1 });
            // Set a modest initial zoom if supported to help small printed codes
            const initZoom = Math.min(2, caps.zoom || 1);
            await applyZoom(initZoom);
          } else if (caps.zoom && typeof caps.zoom.min === "number") {
            setZoomSupported(true);
            setZoomRange({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 });
            const initZoom = Math.min(2, caps.zoom.max || 1);
            await applyZoom(initZoom);
          }
        }
      } catch {}
    } finally {
      setIsStarting(false);
    }
  }, [onDecoded, selectedDeviceId, continuous, applyZoom]);

  useEffect(() => {
    enumerate();
    return () => stop();
  }, [enumerate, stop]);

  useEffect(() => {
    // re-start when device changes
    stop();
    start();
  }, [selectedDeviceId, start, stop]);

  useEffect(() => {
    // Pause/resume scanning when parent toggles `paused`
    if (paused) {
      controlsRef.current?.stop();
    } else {
      start();
    }
  }, [paused, start]);

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
              value={selectedDeviceId}
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

          {/* Zoom */}
          <div className="bg-white/10 backdrop-blur rounded-lg p-2 text-white">
            <label className="text-xs opacity-80">Zoom</label>
            <div className="mt-1 flex items-center gap-2">
              {zoomSupported && zoomRange ? (
                <input
                  type="range"
                  min={zoomRange.min}
                  max={zoomRange.max}
                  step={zoomRange.step}
                  value={zoom ?? zoomRange.min}
                  onChange={(e) => applyZoom(parseFloat(e.target.value))}
                  className="w-full"
                />
              ) : (
                <div className="text-xs opacity-70">Not supported</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
