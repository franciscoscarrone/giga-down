import type { MediaItem, MediaVariant, Quality } from "@/core/types";

/** Piezas comunes a los proveedores que devuelven MP4 sueltos con su tamaño en píxeles. */

export const USER_AGENT = "GigaDown/1.0 (+https://giga-down.vercel.app)";

/** La calidad sale del lado corto: 1280x720, 720x1280 y 720x720 son HD. */
export function qualityForSize(width: number, height: number): Quality {
  const side = Math.min(width, height);
  if (side >= 2160) return "uhd";
  if (side >= 1080) return "fhd";
  if (side >= 720) return "hd";
  if (side >= 360) return "sd";
  return "low";
}

export const positive = (value: number | undefined) => (value && value > 0 ? value : undefined);

/** Para bytes y píxeles: redondea y descarta 0, negativos y NaN. */
export const positiveInt = (value: number | undefined) => positive(Math.round(value ?? 0));

/**
 * Posición entre los videos del medio que pide el link. X e Instagram numeran sobre todos los
 * medios del post, fotos incluidas; si el N-ésimo no es un video, no hay selección.
 */
export function selectedVideoIndex(
  mediaIsVideo: readonly boolean[],
  mediaNumber: number | undefined,
): number | undefined {
  if (!mediaNumber || !mediaIsVideo[mediaNumber - 1]) return undefined;
  return mediaIsVideo.slice(0, mediaNumber - 1).filter(Boolean).length;
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
