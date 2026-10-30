import { z } from "zod";
import { AppError, toAppError } from "@/core/errors";
import type { MediaResult, MediaVariant, Provider } from "@/core/types";
import { createThrottle, sleep } from "@/lib/throttle";

/**
 * Adaptador de la API pública de tikwm (https://www.tikwm.com).
 *
 * - `GET /api/?url=<link>&hd=1` devuelve siempre HTTP 200; el error viene en `code` (0 = ok)
 *   y `msg` (p. ej. "Free Api Limit: 1 request/second." o "Url parsing is failed!...").
 * - Los links de video apuntan al CDN de TikTok (con CORS abierto) o, a veces, son rutas
 *   relativas de tikwm: esas se prefijan con el origen de tikwm.
 * - El plan gratuito permite ~1 pedido por segundo: espaciamos las llamadas y, si igual
 *   pega en el límite, reintentamos una sola vez.
 */

export const TIKWM_ORIGIN = "https://www.tikwm.com";
const API_ENDPOINT = `${TIKWM_ORIGIN}/api/`;
const MIN_INTERVAL_MS = 1_100;
const RATE_LIMIT_RETRY_DELAY_MS = 1_500;

const envelopeSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: z.unknown().optional(),
});

/** Solo los campos que usamos; el resto de la respuesta se ignora. */
const tikwmVideoSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  cover: z.string().optional(),
  origin_cover: z.string().optional(),
  duration: z.number().optional(),
  play: z.string().optional(),
  wmplay: z.string().optional(),
  hdplay: z.string().optional(),
  size: z.number().optional(),
  wm_size: z.number().optional(),
  hd_size: z.number().optional(),
  images: z.array(z.string()).optional(),
  author: z.object({
    unique_id: z.string(),
    nickname: z.string().optional(),
    avatar: z.string().optional(),
  }),
});
export type TikwmVideo = z.infer<typeof tikwmVideoSchema>;

/** Prefija las rutas relativas de tikwm ("/video/...") con su origen. */
export function absolutize(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${TIKWM_ORIGIN}${url}`;
  return url;
}

const positive = (value: number | undefined) => (value && value > 0 ? value : undefined);

export function errorFromTikwmMessage(message: string | undefined): AppError {
  const msg = message?.trim() ?? "";
  if (/limit/i.test(msg)) return new AppError("RATE_LIMITED", `tikwm: ${msg}`);
  if (/url parsing is failed|check url|not (?:found|exist)|private|removed|deleted/i.test(msg)) {
    return new AppError("NOT_FOUND", `tikwm: ${msg}`);
  }
  return new AppError("PROVIDER_ERROR", `tikwm: ${msg || "respuesta sin éxito"}`);
}

/** Traduce la respuesta de tikwm al modelo de la app. */
export function normalizeTikwmVideo(video: TikwmVideo, sourceUrl: string): MediaResult {
  if (video.images?.length) {
    throw new AppError(
      "UNSUPPORTED_URL",
      "Las publicaciones de fotos todavía no están soportadas.",
    );
  }

  const standard = absolutize(video.play);
  const hd = absolutize(video.hdplay);
  const watermarked = absolutize(video.wmplay);
  // Si el video no tiene versión HD, tikwm manda en `hdplay` el mismo archivo que en `play`
  // desde otro host: mismo tamaño en bytes = misma calidad, así que no lo ofrecemos dos veces.
  const hdIsSameFile = positive(video.hd_size) !== undefined && video.hd_size === video.size;
  const variants: MediaVariant[] = [];

  if (standard) {
    variants.push({
      id: "sd",
      quality: "sd",
      watermark: false,
      url: standard,
      size: positive(video.size),
      mimeType: "video/mp4",
    });
  }
  if (hd && hd !== standard && !hdIsSameFile) {
    variants.push({
      id: "hd",
      quality: "hd",
      watermark: false,
      url: hd,
      size: positive(video.hd_size),
      mimeType: "video/mp4",
    });
  }
  // Para algunos videos tikwm repite el link sin marca en `wmplay`: solo lo ofrecemos si es otro.
  if (watermarked && watermarked !== standard && watermarked !== hd) {
    variants.push({
      id: "sd-wm",
      quality: "sd",
      watermark: true,
      url: watermarked,
      size: positive(video.wm_size),
      mimeType: "video/mp4",
    });
  }

  if (variants.length === 0) {
    throw new AppError("PROVIDER_ERROR", "tikwm no devolvió links de video.");
  }

  return {
    platform: "tiktok",
    provider: "tikwm",
    id: video.id,
    sourceUrl,
    author: {
      username: video.author.unique_id,
      displayName: video.author.nickname || undefined,
      avatarUrl: absolutize(video.author.avatar),
    },
    title: video.title?.trim() ?? "",
    coverUrl: absolutize(video.cover) ?? absolutize(video.origin_cover),
    durationSeconds: positive(video.duration),
    variants,
  };
}

export interface TikwmProviderOptions {
  fetch?: typeof fetch;
  minIntervalMs?: number;
  retryDelayMs?: number;
}

export function createTikwmProvider(options: TikwmProviderOptions = {}): Provider {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const waitTurn = createThrottle(options.minIntervalMs ?? MIN_INTERVAL_MS);
  const retryDelayMs = options.retryDelayMs ?? RATE_LIMIT_RETRY_DELAY_MS;

  async function request(url: string, signal: AbortSignal): Promise<TikwmVideo> {
    await waitTurn(signal);
    const endpoint = `${API_ENDPOINT}?url=${encodeURIComponent(url)}&hd=1`;

    let response: Response;
    try {
      response = await doFetch(endpoint, {
        signal,
        headers: { accept: "application/json" },
        cache: "no-store",
      });
    } catch (error) {
      throw toAppError(error, "PROVIDER_ERROR");
    }

    if (response.status === 429) throw new AppError("RATE_LIMITED", "tikwm: HTTP 429");
    if (!response.ok) throw new AppError("PROVIDER_ERROR", `tikwm: HTTP ${response.status}`);

    const json: unknown = await response.json().catch((error: unknown) => {
      throw new AppError("PROVIDER_ERROR", "tikwm: la respuesta no es JSON", { cause: error });
    });
    const envelope = envelopeSchema.safeParse(json);
    if (!envelope.success) {
      throw new AppError("PROVIDER_ERROR", "tikwm: respuesta inesperada", {
        cause: envelope.error,
      });
    }
    if (envelope.data.code !== 0) throw errorFromTikwmMessage(envelope.data.msg);

    const video = tikwmVideoSchema.safeParse(envelope.data.data);
    if (!video.success) {
      throw new AppError("PROVIDER_ERROR", "tikwm: datos del video con forma inesperada", {
        cause: video.error,
      });
    }
    return video.data;
  }

  return {
    id: "tikwm",
    async resolve(url, { signal }) {
      let video: TikwmVideo;
      try {
        video = await request(url, signal);
      } catch (error) {
        if (!(error instanceof AppError && error.code === "RATE_LIMITED")) throw error;
        await sleep(retryDelayMs, signal);
        video = await request(url, signal);
      }
      return normalizeTikwmVideo(video, url);
    },
  };
}

export const tikwmProvider = createTikwmProvider();
