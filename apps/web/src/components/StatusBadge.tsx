import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "running" | "stopped" | "error" | "not_found" | "unknown";
  className?: string;
}

const statusConfig = {
  running: {
    label: "Running",
    dotClass: "bg-emerald-400",
    textClass: "text-emerald-400",
    bgClass: "bg-emerald-400/10 border-emerald-400/20",
  },
  stopped: {
    label: "Stopped",
    dotClass: "bg-surface-400",
    textClass: "text-surface-400",
    bgClass: "bg-surface-400/10 border-surface-400/20",
  },
  error: {
    label: "Error",
    dotClass: "bg-red-400",
    textClass: "text-red-400",
    bgClass: "bg-red-400/10 border-red-400/20",
  },
  not_found: {
    label: "Not Found",
    dotClass: "bg-amber-400",
    textClass: "text-amber-400",
    bgClass: "bg-amber-400/10 border-amber-400/20",
  },
  unknown: {
    label: "Unknown",
    dotClass: "bg-surface-500",
    textClass: "text-surface-500",
    bgClass: "bg-surface-500/10 border-surface-500/20",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.unknown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] shadow-lg shadow-black/10",
        config.bgClass,
        config.textClass,
        className
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          config.dotClass,
          status === "running" && "animate-pulse-slow"
        )}
      />
      {config.label}
    </span>
  );
}
