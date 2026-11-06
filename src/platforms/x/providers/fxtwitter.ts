import { z } from "zod";
import { AppError, toAppError } from "@/core/errors";
import type { MediaItem, MediaResult, Provider } from "@/core/types";
import {
  positive,
  positiveInt,
  selectedVideoIndex,
  USER_AGENT,
  withSizes,
} from "@/platforms/media";
import { parseXStatusUrl } from "../detect";
import { itemLabel, twimgVariants } from "../media";

/**
 * Adaptador de la API pública de FxTwitter (https://docs.fxembed.com), open source.
 *
 * - `GET /2/status/<id>` devuelve `{ code, status }`; `code` repite el status HTTP
 *   (404 = no existe, 401 = privado). Límite: 1000 pedidos por minuto por IP.
 * - Resuelve lo que el endpoint de embeds de X no muestra: videos dentro de "cards" y posts
 *   marcados como sensibles.
 * - Si el post cita a otro con video, esos videos se suman al final con la etiqueta de la cita.
 */

export const FXTWITTER_ORIGIN = "https://api.fxtwitter.com";

const envelopeSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  status: z.unknown().optional(),
});

/** Solo los campos que usamos; el resto de la respuesta se ignora. */
const formatSchema = z.object({
  url: z.string(),
  container: z.string().optional(),
  codec: z.string().optional(),
  bitrate: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  size: z.number().optional(),
});

const videoSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  url: z.string(),
  thumbnail_url: z.string().nullish(),
  duration: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  formats: z.array(formatSchema).optional(),
});
type FxVideo = z.infer<typeof videoSchema>;

const statusSchema = z.object({
  type: z.literal("status"),
  id: z.string().min(1),
  text: z.string().optional(),
  author: z.object({ screen_name: z.string(), name: z.string().optional() }),
  media: z
    .object({
      all: z.array(z.object({ type: z.string() })).optional(),
      videos: z.array(videoSchema).optional(),
    })
    .nullish(),
  /** Otro status o una "tombstone" si no está disponible: se valida aparte. */
  quote: z.unknown().optional(),
});
export type FxStatus = z.infer<typeof statusSchema>;

const tombstoneSchema = z.object({ type: z.literal("tombstone"), reason: z.string().optional() });

function toItem(video: FxVideo, fallbackId: string, quotedFrom?: string): MediaItem {
  // H.264 en MP4 se reproduce en todos lados; HLS (m3u8) no se puede guardar como archivo.
  const mp4 = (video.formats ?? []).filter(
    (f) => f.container === "mp4" || (!f.container && /\.mp4(?:$|\?)/.test(f.url)),
  );
  const h264 = mp4.filter((f) => !f.codec || f.codec === "h264");
  const formats = h264.length ? h264 : mp4.length ? mp4 : [{ url: video.url }];

  return {
    id: video.id ?? fallbackId,
    label: itemLabel(video.type === "gif", quotedFrom),
    coverUrl: video.thumbnail_url ?? undefined,
    durationSeconds: positive(video.duration),
    width: positiveInt(video.width),
    height: positiveInt(video.height),
    variants: twimgVariants(formats, video),
  };
}

/** Traduce un status de FxTwitter al modelo de la app (sin tamaños: los completa el proveedor). */
export function normalizeFxStatus(
  status: FxStatus,
  sourceUrl: string,
  mediaNumber?: number,
): MediaResult {
  const own = (status.media?.videos ?? []).map((v, i) => toItem(v, `${status.id}-${i + 1}`));

  const quote = statusSchema.safeParse(status.quote);
  const quoted = quote.success
    ? (quote.data.media?.videos ?? []).map((v, i) =>
        toItem(v, `${quote.data.id}-${i + 1}`, quote.data.author.screen_name),
      )
    : [];

  const items = [...own, ...quoted];
  if (items.length === 0) {
    throw new AppError("NO_VIDEO", "fxtwitter: el post no tiene videos ni GIFs.");
  }

  const mediaIsVideo = (status.media?.all ?? []).map((m) => m.type !== "photo");
  return {
    platform: "x",
    provider: "fxtwitter",
    id: status.id,
    sourceUrl,
    author: {
      username: status.author.screen_name,
      displayName: status.author.name || undefined,
    },
    title: status.text?.trim() ?? "",
    items,
    selectedIndex: selectedVideoIndex(mediaIsVideo, mediaNumber),
  };
}

function errorFromCode(code: number, message: string | undefined): AppError {
  const detail = `fxtwitter: ${code}${message ? ` ${message}` : ""}`;
  if (code === 404) return new AppError("NOT_FOUND", detail);
  if (code === 401) return new AppError("NOT_FOUND", `${detail} (post privado)`);
  if (code === 429) return new AppError("RATE_LIMITED", detail);
  return new AppError("PROVIDER_ERROR", detail);
}

export interface FxTwitterProviderOptions {
  fetch?: typeof fetch;
  /** Pide el tamaño de cada MP4 con un HEAD al CDN (por defecto, sí). */
  probeSizes?: boolean;
}

export function createFxTwitterProvider(options: FxTwitterProviderOptions = {}): Provider {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const probeSizes = options.probeSizes ?? true;

  return {
    id: "fxtwitter",
    async resolve(url, { signal }) {
      const ref = parseXStatusUrl(new URL(url));
      if (!ref) throw new AppError("UNSUPPORTED_URL");

      let response: Response;
      try {
        response = await doFetch(`${FXTWITTER_ORIGIN}/2/status/${ref.id}`, {
          signal,
          headers: { accept: "application/json", "user-agent": USER_AGENT },
          cache: "no-store",
        });
      } catch (error) {
        throw toAppError(error, "PROVIDER_ERROR");
      }

      // Los errores también vienen en JSON, con el mismo `code` que el status HTTP.
      const json: unknown = await response.json().catch(() => undefined);
      const envelope = envelopeSchema.safeParse(json);
      if (!envelope.success) {
        if (!response.ok) throw errorFromCode(response.status, undefined);
        throw new AppError("PROVIDER_ERROR", "fxtwitter: la respuesta no tiene la forma esperada", {
          cause: envelope.error,
        });
      }
      const { code, message } = envelope.data;
      if (!response.ok || code !== 200)
        throw errorFromCode(response.ok ? code : response.status, message);

      const tombstone = tombstoneSchema.safeParse(envelope.data.status);
      if (tombstone.success) {
        throw new AppError("NOT_FOUND", `fxtwitter: post no disponible (${tombstone.data.reason})`);
      }
      const status = statusSchema.safeParse(envelope.data.status);
      if (!status.success) {
        throw new AppError("PROVIDER_ERROR", "fxtwitter: datos del post con forma inesperada", {
          cause: status.error,
        });
      }

      const media = normalizeFxStatus(status.data, url, ref.mediaNumber);
      return probeSizes
        ? { ...media, items: await withSizes(media.items, doFetch, signal) }
        : media;
    },
  };
}

export const fxTwitterProvider = createFxTwitterProvider();
