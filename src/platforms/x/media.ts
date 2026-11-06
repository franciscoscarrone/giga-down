import type { MediaVariant, Quality } from "@/core/types";
import { positiveInt, qualityForSize } from "@/platforms/media";

/**
 * Piezas comunes a los proveedores de X: los dos terminan con links a video.twimg.com, que
 * tiene CORS abierto y links que no vencen. Cada video viene en 2 a 4 MP4 de distinto bitrate
 * (p. ej. 480x270, 640x360 y 1280x720) más un HLS que no usamos.
 */

export interface TwimgFormat {
  url: string;
  bitrate?: number;
  width?: number;
  height?: number;
  size?: number;
}

/** video.twimg.com pone la resolución en la ruta: /vid/avc1/1280x720/archivo.mp4 */
const RESOLUTION_IN_PATH = /\/(\d{2,5})x(\d{2,5})\//;

/**
 * Una variante por calidad (la de mayor bitrate). Si un formato no trae su resolución (los
 * GIF tienen un único MP4 sin ella), se usa la del video.
 */
export function twimgVariants(
  formats: readonly TwimgFormat[],
  video: { width?: number; height?: number },
): MediaVariant[] {
  const best = new Map<Quality, TwimgFormat>();
  for (const format of formats) {
    const [, w, h] = RESOLUTION_IN_PATH.exec(format.url) ?? [];
    const width = format.width ?? (w ? Number(w) : video.width);
    const height = format.height ?? (h ? Number(h) : video.height);
    const quality = width && height ? qualityForSize(width, height) : "sd";
    const current = best.get(quality);
    if (!current || (format.bitrate ?? 0) > (current.bitrate ?? 0)) best.set(quality, format);
  }
  return [...best].map(([quality, format]) => ({
    id: quality,
    quality,
    watermark: false,
    url: format.url,
    size: positiveInt(format.size),
    mimeType: "video/mp4",
  }));
}

/** Etiqueta del selector: "GIF", "Cita de @usuario" o las dos. */
export function itemLabel(isGif: boolean, quotedFrom: string | undefined): string | undefined {
  const parts = [isGif ? "GIF" : null, quotedFrom ? `Cita de @${quotedFrom}` : null];
  return parts.filter(Boolean).join(" · ") || undefined;
}
