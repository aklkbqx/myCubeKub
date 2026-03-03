const RESOURCE_PACK_IMAGE_SIZE = 512;
const SERVER_ICON_SIZE = 64;

export type ImageResizeMode = "cover" | "contain";
export type ImageEditOptions = {
  mode: ImageResizeMode;
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  flipX?: boolean;
  flipY?: boolean;
};

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

async function loadImageFromFile(file: File, readErrorMessage: string, loadErrorMessage: string) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(readErrorMessage));
    reader.readAsDataURL(file);
  });

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(loadErrorMessage));
    image.src = dataUrl;
  });
}

async function resizeSquarePng(
  file: File,
  size: number,
  baseName: string,
  readErrorMessage: string,
  loadErrorMessage: string,
  encodeErrorMessage: string,
  modeOrOptions: ImageResizeMode | ImageEditOptions | "stretch"
) {
  const image = await loadImageFromFile(file, readErrorMessage, loadErrorMessage);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available in this browser");
  }

  context.clearRect(0, 0, size, size);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (modeOrOptions === "stretch") {
    context.drawImage(image, 0, 0, size, size);
  } else {
    const options = typeof modeOrOptions === "string"
      ? { mode: modeOrOptions }
      : modeOrOptions;
    const mode = options.mode;
    const zoomValue = typeof options.zoom === "number" && Number.isFinite(options.zoom) ? options.zoom : 1;
    const offsetXValue = typeof options.offsetX === "number" && Number.isFinite(options.offsetX) ? options.offsetX : 0;
    const offsetYValue = typeof options.offsetY === "number" && Number.isFinite(options.offsetY) ? options.offsetY : 0;
    const zoom = Math.max(1, zoomValue);
    const requestedOffsetX = offsetXValue * size;
    const requestedOffsetY = offsetYValue * size;
    const baseScale = mode === "cover"
      ? Math.max(size / image.width, size / image.height)
      : Math.min(size / image.width, size / image.height);
    const scale = baseScale * zoom;
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const offsetLimitX = Math.abs(drawWidth - size) / 2;
    const offsetLimitY = Math.abs(drawHeight - size) / 2;
    const offsetX = Math.max(-offsetLimitX, Math.min(offsetLimitX, requestedOffsetX));
    const offsetY = Math.max(-offsetLimitY, Math.min(offsetLimitY, requestedOffsetY));

    context.save();
    context.translate(size / 2 + offsetX, size / 2 + offsetY);
    context.scale(options.flipX ? -scale : scale, options.flipY ? -scale : scale);
    context.drawImage(image, -image.width / 2, -image.height / 2);
    context.restore();
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error(encodeErrorMessage));
        return;
      }

      resolve(nextBlob);
    }, "image/png");
  });

  return new File([blob], `${baseName}.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
}

function decodeZipString(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes);
}

function normalizeZipPath(path: string) {
  return path.replace(/\\/g, "/").toLowerCase();
}

function toStrictArrayBuffer(bytes: Uint8Array) {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
}

async function inflateZipEntry(data: Uint8Array) {
  const stream = new Blob([toStrictArrayBuffer(data)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export const IMAGE_EDIT_SIZES = {
  resourcePack: RESOURCE_PACK_IMAGE_SIZE,
  serverIcon: SERVER_ICON_SIZE,
} as const;

export async function resizeResourcePackImage(
  file: File,
  options: ImageResizeMode | ImageEditOptions = "cover"
) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported for resource pack cover");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "resource-pack-cover";
  return resizeSquarePng(
    file,
    RESOURCE_PACK_IMAGE_SIZE,
    baseName,
    "Failed to read image file",
    "Failed to read image file",
    "Failed to resize image",
    options
  );
}

export async function resizeServerIcon(
  file: File,
  options: ImageResizeMode | ImageEditOptions = "contain"
) {
  return resizeSquarePng(
    file,
    SERVER_ICON_SIZE,
    "server-icon",
    "Failed to read server icon",
    "Failed to load server icon",
    "Failed to encode resized server icon",
    options
  );
}

export async function extractPackImagePreviewFromZip(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const maxCommentLength = 0xffff;
  const eocdStart = Math.max(0, bytes.length - (22 + maxCommentLength));

  let eocdOffset = -1;
  for (let index = bytes.length - 22; index >= eocdStart; index -= 1) {
    if (view.getUint32(index, true) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      eocdOffset = index;
      break;
    }
  }

  if (eocdOffset === -1) {
    return null;
  }

  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  let selectedEntryOffset: number | null = null;
  let selectedCompressionMethod: number | null = null;
  let selectedCompressedSize = 0;
  let selectedNameScore = Number.POSITIVE_INFINITY;
  let cursor = centralDirectoryOffset;

  while (cursor + 46 <= centralDirectoryEnd && cursor + 46 <= bytes.length) {
    if (view.getUint32(cursor, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      break;
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraFieldLength = view.getUint16(cursor + 30, true);
    const fileCommentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLength;
    const entryName = normalizeZipPath(decodeZipString(bytes.slice(nameStart, nameEnd)));

    if (entryName === "pack.png" || entryName.endsWith("/pack.png")) {
      const depth = entryName.split("/").length;
      if (depth < selectedNameScore) {
        selectedEntryOffset = localHeaderOffset;
        selectedCompressionMethod = compressionMethod;
        selectedCompressedSize = compressedSize;
        selectedNameScore = depth;
      }
    }

    cursor = nameEnd + extraFieldLength + fileCommentLength;
  }

  if (selectedEntryOffset === null || selectedCompressionMethod === null) {
    return null;
  }

  if (view.getUint32(selectedEntryOffset, true) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    return null;
  }

  const localFileNameLength = view.getUint16(selectedEntryOffset + 26, true);
  const localExtraFieldLength = view.getUint16(selectedEntryOffset + 28, true);
  const dataStart = selectedEntryOffset + 30 + localFileNameLength + localExtraFieldLength;
  const compressedData = bytes.slice(dataStart, dataStart + selectedCompressedSize);

  let imageBytes: Uint8Array;
  if (selectedCompressionMethod === 0) {
    imageBytes = compressedData;
  } else if (selectedCompressionMethod === 8) {
    imageBytes = await inflateZipEntry(compressedData);
  } else {
    return null;
  }

  return URL.createObjectURL(new Blob([toStrictArrayBuffer(imageBytes)], { type: "image/png" }));
}
