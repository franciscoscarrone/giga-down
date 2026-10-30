import type { MediaItem, MediaVariant, Quality } from "@/core/types";

/**
 * Piezas comunes a los proveedores de X: los dos terminan con links a video.twimg.com, que
 * tiene CORS abierto y links que no vencen. Cada video viene en 2 a 4 MP4 de distinto bitrate
 * (p. ej. 480x270, 640x360 y 1280x720) más un HLS que no usamos.
 */

export const USER_AGENT = "GigaDown/1.0 (+https://giga-down.vercel.app)";

export interface TwimgFormat {
  url: string;
  bitrate?: number;
  width?: number;
  height?: number;
  size?: number;
}

/** La calidad sale del lado corto: 1280x720, 720x1280 y 720x720 son HD. */
export function qualityForSize(width: number, height: number): Quality {
  const side = Math.min(width, height);
  if (side >= 2160) return "uhd";
  if (side >= 1080) return "fhd";
  if (side >= 720) return "hd";
  if (side >= 360) return "sd";
  return "low";
}

/** video.twimg.com pone la resolución en la ruta: /vid/avc1/1280x720/archivo.mp4 */
const RESOLUTION_IN_PATH = /\/(\d{2,5})x(\d{2,5})\//;

export const positive = (value: number | undefined) => (value && value > 0 ? value : undefined);

/** Para bytes y píxeles: redondea y descarta 0, negativos y NaN. */
export const positiveInt = (value: number | undefined) => positive(Math.round(value ?? 0));

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

/**
 * Posición entre los videos del medio que pide el link. X numera /video/N y /photo/N sobre
 * todos los medios del post, fotos incluidas; si el N-ésimo no es un video, no hay selección.
 */
export function selectedVideoIndex(
  mediaIsVideo: readonly boolean[],
  mediaNumber: number | undefined,
): number | undefined {
  if (!mediaNumber || !mediaIsVideo[mediaNumber - 1]) return undefined;
  return mediaIsVideo.slice(0, mediaNumber - 1).filter(Boolean).length;
}

/** Etiqueta del selector: "GIF", "Cita de @usuario" o las dos. */
export function itemLabel(isGif: boolean, quotedFrom: string | undefined): string | undefined {
  const parts = [isGif ? "GIF" : null, quotedFrom ? `Cita de @${quotedFrom}` : null];
  return parts.filter(Boolean).join(" · ") || undefined;
}

const SIZE_PROBE_TIMEOUT_MS = 2_500;

/**
 * Completa el tamaño de cada variante con un HEAD al CDN, todos en paralelo. Es un extra: si
 * algo falla o tarda, la variante queda sin tamaño y la UI muestra una descripción.
 */
export async function withSizes(
  items: readonly MediaItem[],
  doFetch: typeof fetch,
  signal: AbortSignal,
): Promise<MediaItem[]> {
  const probeSignal = AbortSignal.any([signal, AbortSignal.timeout(SIZE_PROBE_TIMEOUT_MS)]);

  const probe = async (variant: MediaVariant): Promise<MediaVariant> => {
    if (variant.size) return variant;
    try {
      const response = await doFetch(variant.url, {
        method: "HEAD",
        signal: probeSignal,
        headers: { "user-agent": USER_AGENT },
      });
      const size = positiveInt(Number(response.headers.get("content-length")));
      return response.ok && size ? { ...variant, size } : variant;
    } catch {
      return variant;
    }
  };

  return Promise.all(
    items.map(async (item) => ({ ...item, variants: await Promise.all(item.variants.map(probe)) })),
  );
}
