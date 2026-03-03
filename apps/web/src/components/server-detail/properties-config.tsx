import type { UpdateServerData } from "@/lib/api";

export type CustomizablePropertyKey = "motd" | "resource-pack-prompt";

type MinecraftTextStyle = {
  color?: string | null;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
};

type MinecraftTextSegment = MinecraftTextStyle & {
  text: string;
};

export type PropertyField =
  | {
      key: string;
      label: string;
      description: string;
      type: "text" | "number" | "boolean";
      placeholder?: string;
    }
  | {
      key: string;
      label: string;
      description: string;
      type: "select";
      options: Array<{ value: string; label: string }>;
      placeholder?: string;
    };

export const CUSTOMIZABLE_PROPERTY_KEYS = new Set<CustomizablePropertyKey>(["motd", "resource-pack-prompt"]);

export const MINECRAFT_COLOR_TOKENS = [
  { code: "0", name: "Black", hex: "#000000" },
  { code: "1", name: "Dark Blue", hex: "#0000AA" },
  { code: "2", name: "Dark Green", hex: "#00AA00" },
  { code: "3", name: "Dark Aqua", hex: "#00AAAA" },
  { code: "4", name: "Dark Red", hex: "#AA0000" },
  { code: "5", name: "Dark Purple", hex: "#AA00AA" },
  { code: "6", name: "Gold", hex: "#FFAA00" },
  { code: "7", name: "Gray", hex: "#AAAAAA" },
  { code: "8", name: "Dark Gray", hex: "#555555" },
  { code: "9", name: "Blue", hex: "#5555FF" },
  { code: "a", name: "Green", hex: "#55FF55" },
  { code: "b", name: "Aqua", hex: "#55FFFF" },
  { code: "c", name: "Red", hex: "#FF5555" },
  { code: "d", name: "Light Purple", hex: "#FF55FF" },
  { code: "e", name: "Yellow", hex: "#FFFF55" },
  { code: "f", name: "White", hex: "#FFFFFF" },
] as const;

const MINECRAFT_COLOR_NAME_BY_CODE = Object.fromEntries(
  MINECRAFT_COLOR_TOKENS.map((color) => [color.code, color.name.toLowerCase().replace(/\s+/g, "_")])
) as Record<string, string>;

const MINECRAFT_COLOR_HEX_BY_NAME = Object.fromEntries(
  MINECRAFT_COLOR_TOKENS.map((color) => [color.name.toLowerCase().replace(/\s+/g, "_"), color.hex])
) as Record<string, string>;

export const MINECRAFT_STYLE_TOKENS = [
  { code: "l", name: "Bold" },
  { code: "o", name: "Italic" },
  { code: "n", name: "Underline" },
  { code: "m", name: "Strikethrough" },
  { code: "k", name: "Magic" },
  { code: "r", name: "Reset" },
] as const;

export const MINECRAFT_SYMBOL_TOKENS = [
  { label: "Heart", value: "\u2665" },
  { label: "Star", value: "\u2726" },
  { label: "Sword", value: "\u2694" },
  { label: "Pickaxe", value: "\u26CF" },
  { label: "Arrow", value: "\u27A4" },
  { label: "Dot", value: "\u2022" },
] as const;

export const PREVIEW_BACKGROUND_PRESETS = [
  { id: "black", label: "Black", className: "bg-black/70" },
  { id: "stone", label: "Stone", className: "bg-slate-700/80" },
  { id: "sand", label: "Sand", className: "bg-amber-100/90" },
  { id: "grass", label: "Grass", className: "bg-emerald-900/75" },
] as const;

const MINECRAFT_MAGIC_PREVIEW_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*+-=?<>[]{}";

export const PROPERTY_FIELDS: PropertyField[] = [
  {
    key: "motd",
    label: "Server Message",
    description: "Message shown to players in the multiplayer server list.",
    type: "text",
    placeholder: "A Minecraft Server",
  },
  {
    key: "max-players",
    label: "Max Players",
    description: "Maximum number of players allowed online at the same time.",
    type: "number",
    placeholder: "20",
  },
  {
    key: "difficulty",
    label: "Difficulty",
    description: "Default world difficulty.",
    type: "select",
    options: [
      { value: "peaceful", label: "Peaceful" },
      { value: "easy", label: "Easy" },
      { value: "normal", label: "Normal" },
      { value: "hard", label: "Hard" },
    ],
  },
  {
    key: "gamemode",
    label: "Default Gamemode",
    description: "Default mode for newly joined players.",
    type: "select",
    options: [
      { value: "survival", label: "Survival" },
      { value: "creative", label: "Creative" },
      { value: "adventure", label: "Adventure" },
      { value: "spectator", label: "Spectator" },
    ],
  },
  { key: "pvp", label: "PVP", description: "Allow or block player-versus-player combat.", type: "boolean" },
  { key: "online-mode", label: "Online Mode", description: "Require Mojang or Microsoft account verification.", type: "boolean" },
  { key: "white-list", label: "Whitelist", description: "Only allow players listed in the whitelist.", type: "boolean" },
  { key: "hardcore", label: "Hardcore", description: "Enable hardcore rules for player deaths.", type: "boolean" },
  { key: "allow-flight", label: "Allow Flight", description: "Permit flight from clients or mods.", type: "boolean" },
  { key: "spawn-protection", label: "Spawn Protection", description: "Protected radius around spawn from block edits.", type: "number", placeholder: "16" },
  { key: "view-distance", label: "View Distance", description: "Chunk render distance sent to players.", type: "number", placeholder: "10" },
  { key: "simulation-distance", label: "Simulation Distance", description: "Chunk simulation distance that stays active.", type: "number", placeholder: "10" },
  { key: "resource-pack", label: "Resource Pack URL", description: "Direct download URL for the server resource pack zip file.", type: "text", placeholder: "https://cdn.example.com/resource-pack.zip" },
  { key: "resource-pack-sha1", label: "Resource Pack SHA1", description: "Optional SHA1 hash used by clients to validate the resource pack.", type: "text", placeholder: "0123456789abcdef0123456789abcdef01234567" },
  { key: "resource-pack-prompt", label: "Resource Pack Prompt", description: "Custom message shown before players download the resource pack.", type: "text", placeholder: "This server uses a custom resource pack." },
  { key: "require-resource-pack", label: "Require Resource Pack", description: "Kick players who decline the server resource pack.", type: "boolean" },
] as const;

export const PROPERTY_DEFAULTS: Record<string, string> = {
  motd: "A Minecraft Server",
  "max-players": "20",
  difficulty: "easy",
  gamemode: "survival",
  pvp: "true",
  "online-mode": "true",
  "white-list": "false",
  hardcore: "false",
  "allow-flight": "false",
  "spawn-protection": "16",
  "view-distance": "10",
  "simulation-distance": "10",
  "resource-pack": "",
  "resource-pack-sha1": "",
  "resource-pack-prompt": "",
  "require-resource-pack": "false",
};

function decodeFormattingEscapes(value: string) {
  return value.replace(/\\u00a7/gi, "\u00A7");
}

function encodeFormattingEscapes(value: string) {
  return value.replace(/\u00A7/g, "\\u00A7");
}

function createDefaultMinecraftTextStyle(): MinecraftTextStyle {
  return {
    color: null,
    bold: false,
    italic: false,
    underlined: false,
    strikethrough: false,
    obfuscated: false,
  };
}

function cloneMinecraftTextStyle(style: MinecraftTextStyle): MinecraftTextStyle {
  return { ...style };
}

function flattenMinecraftTextComponent(component: unknown, activeStyle: MinecraftTextStyle = createDefaultMinecraftTextStyle()): MinecraftTextSegment[] {
  if (typeof component === "string") {
    return [{ ...activeStyle, text: component }];
  }

  if (Array.isArray(component)) {
    return component.flatMap((entry) => flattenMinecraftTextComponent(entry, activeStyle));
  }

  if (!component || typeof component !== "object") {
    return [];
  }

  const nextStyle = cloneMinecraftTextStyle(activeStyle);
  const source = component as Record<string, unknown>;

  if (typeof source.color === "string") nextStyle.color = source.color;
  if (typeof source.bold === "boolean") nextStyle.bold = source.bold;
  if (typeof source.italic === "boolean") nextStyle.italic = source.italic;
  if (typeof source.underlined === "boolean") nextStyle.underlined = source.underlined;
  if (typeof source.strikethrough === "boolean") nextStyle.strikethrough = source.strikethrough;
  if (typeof source.obfuscated === "boolean") nextStyle.obfuscated = source.obfuscated;

  const segments: MinecraftTextSegment[] = [];
  if (typeof source.text === "string" && source.text.length > 0) {
    segments.push({ ...nextStyle, text: source.text });
  }

  if ("extra" in source) {
    segments.push(...flattenMinecraftTextComponent(source.extra, nextStyle));
  }

  return segments;
}

function serializeSegmentsToFormattedText(segments: MinecraftTextSegment[]) {
  return segments
    .map((segment) => {
      let prefix = "";
      if (segment.color) {
        const colorCode = Object.entries(MINECRAFT_COLOR_NAME_BY_CODE).find(([, colorName]) => colorName === segment.color)?.[0];
        if (colorCode) {
          prefix += `\u00A7${colorCode}`;
        }
      }
      if (segment.bold) prefix += "\u00A7l";
      if (segment.italic) prefix += "\u00A7o";
      if (segment.underlined) prefix += "\u00A7n";
      if (segment.strikethrough) prefix += "\u00A7m";
      if (segment.obfuscated) prefix += "\u00A7k";
      return `${prefix}${segment.text}\u00A7r`;
    })
    .join("")
    .replace(/\u00A7r$/u, "");
}

function parseFormattedTextSegments(value: string) {
  const normalized = decodeFormattingEscapes(value);
  const segments: MinecraftTextSegment[] = [];
  let currentStyle = createDefaultMinecraftTextStyle();
  let buffer = "";

  const pushBuffer = () => {
    if (!buffer) return;
    segments.push({ ...currentStyle, text: buffer });
    buffer = "";
  };

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === "\u00A7" && index + 1 < normalized.length) {
      pushBuffer();
      const code = normalized[index + 1].toLowerCase();
      index += 1;

      if (code in MINECRAFT_COLOR_NAME_BY_CODE) {
        currentStyle = {
          color: MINECRAFT_COLOR_NAME_BY_CODE[code],
          bold: false,
          italic: false,
          underlined: false,
          strikethrough: false,
          obfuscated: false,
        };
        continue;
      }

      if (code === "l") currentStyle.bold = true;
      if (code === "o") currentStyle.italic = true;
      if (code === "n") currentStyle.underlined = true;
      if (code === "m") currentStyle.strikethrough = true;
      if (code === "k") currentStyle.obfuscated = true;
      if (code === "r") currentStyle = createDefaultMinecraftTextStyle();
      continue;
    }

    buffer += char;
  }

  pushBuffer();
  return segments;
}

function promptPropertyToFormattedText(rawValue: string) {
  if (!rawValue.trim()) {
    return "";
  }

  try {
    const parsed = JSON.parse(rawValue);
    const segments = flattenMinecraftTextComponent(parsed);
    if (segments.length > 0) {
      return serializeSegmentsToFormattedText(segments);
    }
  } catch {
    return decodeFormattingEscapes(rawValue);
  }

  return decodeFormattingEscapes(rawValue);
}

function formattedTextToPromptProperty(value: string) {
  const segments = parseFormattedTextSegments(value);
  if (segments.length === 0) {
    return "";
  }

  const extra = segments.map((segment) => {
    const nextSegment: Record<string, unknown> = { text: segment.text };
    if (segment.color) nextSegment.color = segment.color;
    if (segment.bold) nextSegment.bold = true;
    if (segment.italic) nextSegment.italic = true;
    if (segment.underlined) nextSegment.underlined = true;
    if (segment.strikethrough) nextSegment.strikethrough = true;
    if (segment.obfuscated) nextSegment.obfuscated = true;
    return nextSegment;
  });

  return JSON.stringify({ text: "", extra });
}

export function rawPropertyValueToEditorValue(key: CustomizablePropertyKey, rawValue: string) {
  if (key === "motd") {
    return decodeFormattingEscapes(rawValue);
  }

  return promptPropertyToFormattedText(rawValue);
}

export function editorValueToRawPropertyValue(key: CustomizablePropertyKey, editorValue: string) {
  if (key === "motd") {
    return encodeFormattingEscapes(editorValue);
  }

  return formattedTextToPromptProperty(editorValue);
}

function renderMinecraftMagicPreviewText(value: string, frame: number, seed: number) {
  let visibleIndex = 0;

  return value.replace(/[^\s]/g, () => {
    const nextChar = MINECRAFT_MAGIC_PREVIEW_CHARS[(frame + seed + visibleIndex) % MINECRAFT_MAGIC_PREVIEW_CHARS.length];
    visibleIndex += 1;
    return nextChar;
  });
}

export function renderMinecraftPreviewSegments(value: string, animationFrame: number) {
  const segments = parseFormattedTextSegments(value);

  if (segments.length === 0) {
    return <span className="text-surface-500">Preview will appear here.</span>;
  }

  return segments.map((segment, index) => {
    const obfuscatedText = segment.obfuscated
      ? renderMinecraftMagicPreviewText(segment.text, animationFrame, index * 17)
      : segment.text;

    return (
      <span
        key={`${segment.text}-${index}`}
        style={{
          color: segment.color ? MINECRAFT_COLOR_HEX_BY_NAME[segment.color] || "#FFFFFF" : "#FFFFFF",
          fontWeight: segment.bold ? 700 : 400,
          fontStyle: segment.italic ? "italic" : "normal",
          textDecoration: [
            segment.underlined ? "underline" : "",
            segment.strikethrough ? "line-through" : "",
          ].filter(Boolean).join(" "),
        }}
      >
        {obfuscatedText.split("\n").map((line, lineIndex, lines) => (
          <span key={`${lineIndex}-${line}`}>
            {line}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </span>
    );
  });
}

export function normalizePropertiesForComparison(properties: Record<string, string>) {
  return Object.keys(properties)
    .sort()
    .reduce<Record<string, string>>((result, key) => {
      result[key] = properties[key] ?? "";
      return result;
    }, {});
}

export function normalizeSettingsForComparison(settings: UpdateServerData, memoryMinMb: number) {
  return {
    name: settings.name ?? "",
    port: settings.port ?? 25565,
    version: settings.version ?? "",
    type: settings.type ?? "",
    memoryMb: settings.memoryMb ?? memoryMinMb,
    autoBackupEnabled: settings.autoBackupEnabled ?? false,
    autoBackupIntervalHours: settings.autoBackupIntervalHours ?? 24,
    autoBackupRetentionCount: settings.autoBackupRetentionCount ?? 5,
  };
}
