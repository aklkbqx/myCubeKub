import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Maximize2, Minimize2, RefreshCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageEditOptions, ImageResizeMode } from "@/components/server-detail/resource-pack-utils";

interface ImageEditModalProps {
  file: File;
  title: string;
  size: number;
  confirmLabel?: string;
  initialMode?: ImageResizeMode;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (options: ImageEditOptions) => void | Promise<void>;
}

type Offset = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ImageEditModal({
  file,
  title,
  size,
  confirmLabel = "Use This Image",
  initialMode = "cover",
  saving = false,
  onCancel,
  onConfirm,
}: ImageEditModalProps) {
  const [mode, setMode] = useState<ImageResizeMode>(initialMode);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);

  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: Offset;
  } | null>(null);

  useEffect(() => {
    setMode(initialMode);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setFlipX(false);
    setFlipY(false);
  }, [file, initialMode]);

  useEffect(() => {
    let cancelled = false;
    const reader = new FileReader();

    setPreviewSrc(null);
    setPreviewFailed(false);
    setImageSize({ width: 0, height: 0 });

    reader.onload = () => {
      if (cancelled) return;
      const nextResult = reader.result;
      setPreviewSrc(typeof nextResult === "string" ? nextResult : null);
    };

    reader.onerror = () => {
      if (cancelled) return;
      setPreviewFailed(true);
    };

    reader.readAsDataURL(file);

    return () => {
      cancelled = true;
      if (reader.readyState === FileReader.LOADING) {
        reader.abort();
      }
    };
  }, [file]);

  useEffect(() => {
    if (!previewSrc) return;

    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (cancelled) return;
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    };

    image.onerror = () => {
      if (cancelled) return;
      setPreviewFailed(true);
    };

    image.src = previewSrc;

    return () => {
      cancelled = true;
    };
  }, [previewSrc]);

  useEffect(() => {
    const node = previewFrameRef.current;
    if (!node) return;

    const updateSize = () => {
      setFrameSize(node.clientWidth);
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const renderMetrics = useMemo(() => {
    if (!frameSize || !imageSize.width || !imageSize.height) {
      return {
        width: 0,
        height: 0,
        limitX: 0,
        limitY: 0,
        offsetX: 0,
        offsetY: 0,
        offsetRatioX: 0,
        offsetRatioY: 0,
      };
    }

    const baseScale = mode === "cover"
      ? Math.max(frameSize / imageSize.width, frameSize / imageSize.height)
      : Math.min(frameSize / imageSize.width, frameSize / imageSize.height);
    const width = imageSize.width * baseScale * zoom;
    const height = imageSize.height * baseScale * zoom;
    const limitX = Math.abs(width - frameSize) / 2;
    const limitY = Math.abs(height - frameSize) / 2;
    const requestedOffsetX = offset.x * frameSize;
    const requestedOffsetY = offset.y * frameSize;
    const offsetX = clamp(requestedOffsetX, -limitX, limitX);
    const offsetY = clamp(requestedOffsetY, -limitY, limitY);

    return {
      width,
      height,
      limitX,
      limitY,
      offsetX,
      offsetY,
      offsetRatioX: frameSize > 0 ? offsetX / frameSize : 0,
      offsetRatioY: frameSize > 0 ? offsetY / frameSize : 0,
    };
  }, [frameSize, imageSize.height, imageSize.width, mode, offset.x, offset.y, zoom]);

  const updateOffset = (nextOffset: Offset) => {
    setOffset(nextOffset);
  };

  const nudgeOffset = (deltaX: number, deltaY: number) => {
    if (!frameSize) return;
    updateOffset({
      x: renderMetrics.offsetRatioX + deltaX / frameSize,
      y: renderMetrics.offsetRatioY + deltaY / frameSize,
    });
  };

  const resetEdits = () => {
    setMode(initialMode);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setFlipX(false);
    setFlipY(false);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!previewSrc || previewFailed || saving) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: {
        x: renderMetrics.offsetRatioX,
        y: renderMetrics.offsetRatioY,
      },
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !frameSize) return;

    updateOffset({
      x: dragState.origin.x + (event.clientX - dragState.startX) / frameSize,
      y: dragState.origin.y + (event.clientY - dragState.startY) / frameSize,
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-surface-950/85 px-3 py-3 backdrop-blur-sm sm:items-center sm:justify-center sm:px-6 sm:py-6">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-surface-700/70 bg-surface-900 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-4 border-b border-surface-800/80 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-surface-100 sm:text-xl">{title}</h3>
            <p className="mt-1 text-sm text-surface-400">Crop and frame before exporting {size}x{size} PNG.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="btn-icon flex-shrink-0 text-surface-400 hover:text-surface-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close image editor"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="border-b border-surface-800/80 px-4 py-4 sm:px-5 xl:border-b-0 xl:border-r">
            <div className="rounded-[20px] border border-surface-800/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(17,24,39,0.9))] p-4">
              <div className="mx-auto flex max-w-[560px] flex-col items-center">
                <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-surface-500">
                  Drag To Reposition
                </div>
                <div
                  ref={previewFrameRef}
                  className={cn(
                    "relative flex aspect-square w-full max-w-[460px] items-center justify-center overflow-hidden rounded-[24px] border border-surface-700/70 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.08),transparent_55%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,0.92))] shadow-inner shadow-black/20",
                    previewSrc && !previewFailed ? "cursor-grab active:cursor-grabbing" : ""
                  )}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] [background-size:24px_24px]" />
                  <div className="pointer-events-none absolute inset-0 border-[10px] border-black/10" />
                  {previewSrc && !previewFailed && renderMetrics.width > 0 && renderMetrics.height > 0 ? (
                    <img
                      src={previewSrc}
                      alt="Image edit preview"
                      className="relative max-w-none select-none touch-none"
                      draggable={false}
                      style={{
                        width: `${renderMetrics.width}px`,
                        height: `${renderMetrics.height}px`,
                        transform: `translate(${renderMetrics.offsetX}px, ${renderMetrics.offsetY}px) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`,
                      }}
                      onError={() => setPreviewFailed(true)}
                    />
                  ) : (
                    <div className="relative flex h-full w-full items-center justify-center px-6 text-center text-sm text-surface-400">
                      {previewFailed
                        ? "This image could not be previewed. You can choose another file and try again."
                        : "Preparing image preview..."}
                    </div>
                  )}
                </div>
                <p className="mt-3 text-center text-xs text-surface-500">Zoom, drag, and flip as needed.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col px-4 py-4 sm:px-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Fit</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("cover")}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left transition-colors",
                      mode === "cover"
                        ? "border-brand-500/35 bg-brand-500/10"
                        : "border-surface-700/70 bg-surface-950/60 hover:border-brand-500/20"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border",
                        mode === "cover"
                          ? "border-brand-500/30 bg-brand-500/12 text-brand-200"
                          : "border-surface-700/70 bg-surface-900/70 text-surface-400"
                      )}>
                        <Maximize2 size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-100">Cover</p>
                        <p className="mt-0.5 text-xs text-surface-400">Fill frame</p>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("contain")}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left transition-colors",
                      mode === "contain"
                        ? "border-brand-500/35 bg-brand-500/10"
                        : "border-surface-700/70 bg-surface-950/60 hover:border-brand-500/20"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border",
                        mode === "contain"
                          ? "border-brand-500/30 bg-brand-500/12 text-brand-200"
                          : "border-surface-700/70 bg-surface-900/70 text-surface-400"
                      )}>
                        <Minimize2 size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-100">Contain</p>
                        <p className="mt-0.5 text-xs text-surface-400">Keep full image</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-surface-800/80 bg-surface-950/50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Zoom</p>
                  <span className="rounded-full border border-surface-700/70 bg-surface-900/80 px-2.5 py-1 text-xs text-surface-200">
                    {zoom.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="mt-4 w-full accent-brand-400"
                />
              </div>

              <div className="rounded-xl border border-surface-800/80 bg-surface-950/50 px-3 py-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Move</p>
                  <button type="button" onClick={resetEdits} className="btn-secondary inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs">
                    <RefreshCcw size={12} />
                    Reset
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span />
                  <button type="button" onClick={() => nudgeOffset(0, -12)} className="btn-secondary inline-flex items-center justify-center px-0">
                    <ArrowUp size={14} />
                  </button>
                  <span />
                  <button type="button" onClick={() => nudgeOffset(-12, 0)} className="btn-secondary inline-flex items-center justify-center px-0">
                    <ArrowLeft size={14} />
                  </button>
                  <div className="flex items-center justify-center text-[10px] uppercase tracking-[0.18em] text-surface-500">
                    Drag
                  </div>
                  <button type="button" onClick={() => nudgeOffset(12, 0)} className="btn-secondary inline-flex items-center justify-center px-0">
                    <ArrowRight size={14} />
                  </button>
                  <span />
                  <button type="button" onClick={() => nudgeOffset(0, 12)} className="btn-secondary inline-flex items-center justify-center px-0">
                    <ArrowDown size={14} />
                  </button>
                  <span />
                </div>
              </div>

              <div className="rounded-xl border border-surface-800/80 bg-surface-950/50 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Flip</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFlipX((current) => !current)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm transition-colors",
                      flipX
                        ? "border-brand-500/35 bg-brand-500/10 text-brand-100"
                        : "border-surface-700/70 bg-surface-950/60 text-surface-300 hover:border-brand-500/20"
                    )}
                  >
                    Flip Horizontal
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlipY((current) => !current)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm transition-colors",
                      flipY
                        ? "border-brand-500/35 bg-brand-500/10 text-brand-100"
                        : "border-surface-700/70 bg-surface-950/60 text-surface-300 hover:border-brand-500/20"
                    )}
                  >
                    Flip Vertical
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-surface-800/80 bg-surface-950/50 px-3 py-3 text-sm text-surface-400">
                <p className="truncate text-surface-200">{file.name}</p>
                <p className="mt-1 text-xs text-surface-500">{size}x{size} PNG output</p>
              </div>
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 border-t border-surface-800/80 pt-4 sm:mt-auto sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onConfirm({
                  mode,
                  zoom,
                  offsetX: renderMetrics.offsetRatioX,
                  offsetY: renderMetrics.offsetRatioY,
                  flipX,
                  flipY,
                })}
                disabled={saving || !previewSrc || previewFailed}
                className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check size={14} />
                {saving ? "Applying..." : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
