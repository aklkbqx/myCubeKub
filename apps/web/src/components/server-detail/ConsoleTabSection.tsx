import { Terminal } from "lucide-react";
import { Console } from "@/components/Console";

interface ConsoleTabSectionProps {
  serverId: string;
  isRunning: boolean;
}

export function ConsoleTabSection({
  serverId,
  isRunning,
}: ConsoleTabSectionProps) {
  return (
    <div className="card">
      <h3 className="mb-4 text-lg font-semibold text-surface-100">Console</h3>
      {isRunning ? (
        <Console serverId={serverId} />
      ) : (
        <div className="py-12 text-center text-surface-500">
          <Terminal size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Server must be running to view console.</p>
        </div>
      )}
    </div>
  );
}
