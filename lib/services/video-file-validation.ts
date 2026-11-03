import type { VideoFileValidationResult } from "@/types/google-drive";

export const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

const SUPPORTED_EXTENSIONS = [
  "mp4",
  "mov",
  "webm",
  "avi",
  "mkv",
  "flv",
  "wmv",
] as const;

type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

const MIME_BY_EXTENSION: Record<SupportedExtension, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv",
};

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function matchesMagic(extension: string, bytes: Uint8Array): boolean {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));

  switch (extension) {
    case "mp4":
    case "mov":
      return bytes.length >= 8 && ascii(4, 8) === "ftyp";
    case "webm":
    case "mkv":
      return (
        bytes.length >= 4 &&
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
      );
    case "avi":
      return bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "AVI ";
    case "flv":
      return bytes.length >= 3 && ascii(0, 3) === "FLV";
    case "wmv": {
      const signature = [
        0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00,
        0xaa, 0x00, 0x62, 0xce, 0x6c,
      ];
      return signature.every((byte, index) => bytes[index] === byte);
    }
    default:
      return false;
  }
}

export function maxVideoBytes(): number {
  const parsed = Number(process.env.GOOGLE_DRIVE_MAX_FILE_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MAX_VIDEO_BYTES;
}

export function supportedExtensions(): readonly string[] {
  return SUPPORTED_EXTENSIONS;
}

/**
 * Valida extensão, tamanho e magic bytes antes de qualquer chamada ao Drive
 * (Propriedade 7). O arquivo nunca é confiado apenas pela extensão/MIME.
 */
export async function validateVideoFile(
  file: Pick<File, "name" | "size" | "type" | "slice">,
): Promise<VideoFileValidationResult> {
  const extension = extensionOf(file.name);
  if (!SUPPORTED_EXTENSIONS.includes(extension as SupportedExtension)) {
    return {
      valid: false,
      code: "invalid_file",
      message: "Formato de arquivo não suportado",
      extension,
      mimeType: file.type,
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      code: "invalid_file",
      message: "O arquivo de vídeo está vazio",
      extension,
      mimeType: file.type,
    };
  }

  if (file.size > maxVideoBytes()) {
    return {
      valid: false,
      code: "file_too_large",
      message: "O arquivo excede o limite de 5GB",
      extension,
      mimeType: file.type,
    };
  }

  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!matchesMagic(extension, bytes)) {
    return {
      valid: false,
      code: "invalid_file",
      message: "Formato de arquivo não suportado",
      extension,
      mimeType: file.type,
    };
  }

  return {
    valid: true,
    extension,
    mimeType: file.type || MIME_BY_EXTENSION[extension as SupportedExtension],
  };
}

export function mimeTypeForExtension(extension: string): string {
  return (
    MIME_BY_EXTENSION[extension.toLowerCase() as SupportedExtension] ??
    "application/octet-stream"
  );
}
