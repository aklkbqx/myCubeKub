export interface SelectOption {
  value: string;
  label: string;
}

export const SERVER_TYPE_OPTIONS: SelectOption[] = [
  { value: "vanilla", label: "Vanilla" },
  { value: "paper", label: "Paper" },
  { value: "fabric", label: "Fabric" },
  { value: "forge", label: "Forge" },
  { value: "spigot", label: "Spigot" },
];

export const SERVER_VERSION_OPTIONS: SelectOption[] = [
  { value: "latest", label: "Latest (1.21.11)" },
  { value: "1.21.11", label: "1.21.11" },
  { value: "1.21.10", label: "1.21.10" },
  { value: "1.21.9", label: "1.21.9" },
  { value: "1.21.4", label: "1.21.4" },
  { value: "1.21.3", label: "1.21.3" },
  { value: "1.21.1", label: "1.21.1" },
  { value: "1.20.4", label: "1.20.4" },
  { value: "1.20.2", label: "1.20.2" },
  { value: "1.20.1", label: "1.20.1" },
  { value: "1.19.4", label: "1.19.4" },
  { value: "1.18.2", label: "1.18.2" },
];

export const MEMORY_MIN_MB = 1024;
export const MEMORY_MAX_MB = 8192;
export const MEMORY_STEP_MB = 1024;

export function formatMemoryGb(memoryMb: number) {
  return `${memoryMb / 1024} GB`;
}
