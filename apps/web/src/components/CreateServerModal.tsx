import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { CreateServerData } from "@/lib/api";
import SelectDropdown from "./SelectDropdown";
import { LoadingOverlay } from "./LoadingOverlay";
import {
  formatMemoryGb,
  MEMORY_MAX_MB,
  MEMORY_MIN_MB,
  MEMORY_STEP_MB,
  SERVER_TYPE_OPTIONS,
  SERVER_VERSION_OPTIONS,
} from "@/lib/serverFormOptions";

interface CreateServerModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: CreateServerData) => Promise<void>;
  usedPorts: number[];
}

export function CreateServerModal({ open, onClose, onCreate, usedPorts }: CreateServerModalProps) {
  const [name, setName] = useState("");
  const [port, setPort] = useState(25565);
  const [version, setVersion] = useState("latest");
  const [type, setType] = useState("vanilla");
  const [memoryMb, setMemoryMb] = useState(1024);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isDuplicatePort = usedPorts.includes(port);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await onCreate({ name, port, version, type, memoryMb });
      // Reset form
      setName("");
      setPort(25565);
      setVersion("latest");
      setType("vanilla");
      setMemoryMb(1024);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 bacdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="card relative w-full max-w-lg animate-slide-up z-10">
        {loading && <LoadingOverlay message="Creating server" subtle />}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-surface-100">Create Server</h2>
          <button onClick={onClose} className="btn-icon text-surface-400 hover:text-surface-200">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Server Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Minecraft Server"
              className="input-field w-full"
              required
              autoFocus
            />
          </div>

          {/* Type + Version */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                Server Type
              </label>
              <SelectDropdown
                options={SERVER_TYPE_OPTIONS}
                value={type}
                onChange={setType}
                placeholder="Select server type"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                Version
              </label>
              <SelectDropdown
                options={SERVER_VERSION_OPTIONS}
                value={version}
                onChange={setVersion}
                placeholder="Select version"
              />
            </div>
          </div>

          {/* Port + Memory */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">
                Port
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                min={1024}
                max={65535}
                className="input-field w-full"
                required
              />
              {isDuplicatePort && (
                <p className="mt-1.5 text-sm text-red-400">
                  Port {port} is already in use. Duplicate ports are not allowed.
                </p>
              )}
            </div>
            <div className="col-span-1">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-surface-300">
                  Memory
                </label>
                <span className="text-sm font-semibold text-brand-300">
                  {formatMemoryGb(memoryMb)}
                </span>
              </div>
              <input
                type="range"
                value={memoryMb}
                onChange={(e) => setMemoryMb(Number(e.target.value))}
                min={MEMORY_MIN_MB}
                max={MEMORY_MAX_MB}
                step={MEMORY_STEP_MB}
                className="memory-slider w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-surface-500">
                <span>{formatMemoryGb(MEMORY_MIN_MB)}</span>
                <span>{formatMemoryGb(MEMORY_MAX_MB)}</span>
              </div>
            </div>
          </div>

          {/* Memory hint */}
          <p className="text-xs text-surface-500">
            Recommended: 1024 MB for Vanilla, 2048+ MB for modded servers
          </p>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={loading || !name || isDuplicatePort}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="animate-spin">⟳</span> Creating...
                </span>
              ) : (
                "Create Server"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
