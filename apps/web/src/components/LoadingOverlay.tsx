import { Blocks } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  message?: string;
  mode?: "fixed" | "absolute";
  subtle?: boolean;
  className?: string;
}

export function LoadingOverlay({
  message = "Loading",
  mode = "absolute",
  subtle = false,
  className,
}: LoadingOverlayProps) {
  return (
    <div
      className={cn(
        mode === "fixed" ? "fixed inset-0" : "absolute inset-0",
        "z-[140] flex items-center justify-center overflow-hidden rounded-[inherit]",
        subtle ? "bg-surface-950/45 backdrop-blur-md" : "bg-surface-950/72 backdrop-blur-lg",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="loading-grid absolute inset-0 opacity-60" />
        <div className="loading-shard absolute left-[12%] top-[18%] h-6 w-6 rounded-[4px] bg-brand-400/20" />
        <div className="loading-shard absolute right-[16%] top-[22%] h-5 w-5 rounded-[4px] bg-emerald-300/20 [animation-delay:140ms]" />
        <div className="loading-shard absolute bottom-[20%] left-[20%] h-4 w-4 rounded-[4px] bg-cyan-300/20 [animation-delay:260ms]" />
        <div className="loading-shard absolute bottom-[24%] right-[22%] h-7 w-7 rounded-[4px] bg-brand-300/15 [animation-delay:380ms]" />
      </div>

      <div className="minecraft-card relative min-w-[240px] px-6 py-5 text-center">
        <div className="relative flex flex-col items-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-500/25 bg-brand-500/10 text-brand-300 shadow-lg shadow-brand-900/20">
            <Blocks size={24} className="animate-pulse-slow" />
          </div>
          <div className="loading-blocks mb-3">
            <span />
            <span />
            <span />
            <span />
          </div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-brand-200/85">System Activity</p>
          <p className="mt-2 text-base font-semibold text-surface-50">{message}</p>
          <p className="mt-1 text-xs text-surface-400">Preparing the next block...</p>
        </div>
      </div>
    </div>
  );
}
