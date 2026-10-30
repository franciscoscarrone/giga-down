import { qualityRank, type MediaResult, type MediaVariant } from "@/core/types";

/**
 * Descarga directa desde el CDN al dispositivo: el video nunca pasa por nuestro servidor.
 *
 * 1. `fetch` del link a un Blob (los CDN de TikTok responden con CORS abierto).
 * 2. Si la calidad elegida falla, se prueba con las otras sin marca de agua.
 * 3. Si ninguna se puede bajar por CORS o red, el llamador abre el link en otra pestaña.
 */

export class DownloadError extends Error {
  constructor(
    readonly kind: "network" | "http",
    readonly status?: number,
  ) {
    super(kind === "http" ? `HTTP ${status}` : "Error de red o CORS");
    this.name = "DownloadError";
  }
}

/** Orden de intento: la elegida y después las demás sin marca, de mayor a menor calidad. */
export function downloadOrder(
  variants: readonly MediaVariant[],
  selectedId: string,
): MediaVariant[] {
  const selected = variants.find((v) => v.id === selectedId);
  const others = variants
    .filter((v) => !v.watermark && v.id !== selectedId)
    .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
  return selected ? [selected, ...others] : others;
}

export function buildFilename(media: MediaResult, variant: MediaVariant): string {
  const parts = [
    media.platform,
    media.author.username,
    media.id,
    variant.quality,
    variant.watermark ? "marca" : undefined,
  ];
  const base = parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_");
  return `${base}.mp4`;
}

export async function fetchBlob(
  url: string,
  options: { signal?: AbortSignal; onProgress?: (fraction: number | undefined) => void } = {},
): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: options.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new DownloadError("network");
  }
  if (!response.ok) throw new DownloadError("http", response.status);

  const type = response.headers.get("content-type") ?? "video/mp4";
  const total = Number(response.headers.get("content-length")) || undefined;
  if (!response.body) return response.blob();

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      options.onProgress?.(total ? Math.min(received / total, 1) : undefined);
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new DownloadError("network");
  }
  return new Blob(chunks, { type });
}

export type DownloadOutcome =
  | { kind: "file"; file: File; variant: MediaVariant; fellBack: boolean }
  /** Ninguna variante se pudo bajar por CORS o red: hay que abrir el link en otra pestaña. */
  | { kind: "blocked"; variant: MediaVariant };

/** Baja la variante elegida o, si falla, otra calidad. Lanza DownloadError si todas fallan por HTTP. */
export async function downloadMedia(
  media: MediaResult,
  selectedId: string,
  options: { signal?: AbortSignal; onProgress?: (fraction: number | undefined) => void } = {},
): Promise<DownloadOutcome> {
  const order = downloadOrder(media.variants, selectedId);
  const first = order[0];
  if (!first) throw new DownloadError("http", 404);

  let sawNetworkError = false;
  let lastError: DownloadError | undefined;

  for (const variant of order) {
    try {
      options.onProgress?.(0);
      const blob = await fetchBlob(variant.url, options);
      const file = new File([blob], buildFilename(media, variant), {
        type: blob.type || variant.mimeType,
      });
      return { kind: "file", file, variant, fellBack: variant.id !== first.id };
    } catch (error) {
      if (!(error instanceof DownloadError)) throw error;
      lastError = error;
      if (error.kind === "network") sawNetworkError = true;
    }
  }

  if (sawNetworkError) return { kind: "blocked", variant: first };
  throw lastError ?? new DownloadError("network");
}

/** Dispara la descarga del archivo con un `<a download>` temporal. */
export function saveFile(file: File): void {
  const href = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Safari necesita que la URL siga viva un rato después del click.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/** iOS: el menú Compartir con el archivo ofrece "Guardar video" (va directo a Fotos). */
export function canShareFile(file: File): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.canShare?.({ files: [file] }));
}
