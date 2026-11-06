import { z } from "zod";
import { AppError, toAppError } from "@/core/errors";
import type { MediaItem, MediaResult, Provider } from "@/core/types";
import { selectedVideoIndex, USER_AGENT, withSizes } from "@/platforms/media";
import { parseXStatusUrl } from "../detect";
import { itemLabel, twimgVariants } from "../media";

/**
 * Adaptador del endpoint de embeds de X (el que usan los tweets incrustados en otras webs).
 * Es de X, público y sin claves: sirve de respaldo si FxTwitter falla.
 *
 * - `GET https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=<token>`. El token sale
 *   del id con la misma fórmula que usa el script de embeds (ver `syndicationToken`).
 * - Un post borrado, privado o sensible llega como `TweetTombstone`; uno inexistente, como 404.
 * - No ve los videos que vienen dentro de "cards" (publicidades, links con video).
 */

export const SYNDICATION_ENDPOINT = "https://cdn.syndication.twimg.com/tweet-result";

/** Token que pide el endpoint: el id en base 36, escalado, sin ceros ni punto. */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

/** Solo los campos que usamos; el resto de la respuesta se ignora. */
const mediaSchema = z.object({
  type: z.string(),
  media_url_https: z.string().optional(),
  original_info: z.object({ width: z.number(), height: z.number() }).partial().optional(),
  video_info: z
    .object({
      duration_millis: z.number().optional(),
      variants: z.array(
        z.object({
          url: z.string(),
          content_type: z.string().optional(),
          bitrate: z.number().optional(),
        }),
      ),
    })
    .optional(),
});
type SyndicationMedia = z.infer<typeof mediaSchema>;

const tweetSchema = z.object({
  __typename: z.literal("Tweet"),
  id_str: z.string().min(1),
  text: z.string().optional(),
  user: z.object({ screen_name: z.string(), name: z.string().optional() }),
  mediaDetails: z.array(mediaSchema).optional(),
  /** Otro tweet (o una tombstone): se valida aparte. */
  quoted_tweet: z.unknown().optional(),
});
export type SyndicationTweet = z.infer<typeof tweetSchema>;

const isVideo = (m: SyndicationMedia) => m.type === "video" || m.type === "animated_gif";

/** El texto trae al final el link t.co de la foto o el video, y entidades HTML escapadas. */
export function cleanTweetText(text: string | undefined): string {
  return (text ?? "")
    .replace(/(?:\s*https:\/\/t\.co\/\w+)+\s*$/, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim();
}

function videosOf(tweet: SyndicationTweet, quotedFrom?: string): MediaItem[] {
  return (tweet.mediaDetails ?? []).filter(isVideo).map((media, index) => {
    const size = { width: media.original_info?.width, height: media.original_info?.height };
    const formats = (media.video_info?.variants ?? [])
      .filter((v) => v.content_type === "video/mp4")
      .map((v) => ({ url: v.url, bitrate: v.bitrate }));
    const duration = media.video_info?.duration_millis;
    return {
      id: `${tweet.id_str}-${index + 1}`,
      label: itemLabel(media.type === "animated_gif", quotedFrom),
      coverUrl: media.media_url_https,
      durationSeconds: duration && duration > 0 ? duration / 1000 : undefined,
      width: size.width && size.width > 0 ? size.width : undefined,
      height: size.height && size.height > 0 ? size.height : undefined,
      variants: twimgVariants(formats, size),
    };
  });
}

/** Traduce la respuesta del endpoint de embeds al modelo de la app (sin tamaños). */
export function normalizeSyndicationTweet(
  tweet: SyndicationTweet,
  sourceUrl: string,
  mediaNumber?: number,
): MediaResult {
  const quote = tweetSchema.safeParse(tweet.quoted_tweet);
  const items = [
    ...videosOf(tweet),
    ...(quote.success ? videosOf(quote.data, quote.data.user.screen_name) : []),
  ].filter((item) => item.variants.length > 0);

  if (items.length === 0) {
    throw new AppError("NO_VIDEO", "syndication: el post no tiene videos ni GIFs.");
  }

  return {
    platform: "x",
    provider: "syndication",
    id: tweet.id_str,
    sourceUrl,
    author: { username: tweet.user.screen_name, displayName: tweet.user.name || undefined },
    title: cleanTweetText(tweet.text),
    items,
    selectedIndex: selectedVideoIndex((tweet.mediaDetails ?? []).map(isVideo), mediaNumber),
  };
}

export interface SyndicationProviderOptions {
  fetch?: typeof fetch;
  /** Pide el tamaño de cada MP4 con un HEAD al CDN (por defecto, sí). */
  probeSizes?: boolean;
}

export function createSyndicationProvider(options: SyndicationProviderOptions = {}): Provider {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const probeSizes = options.probeSizes ?? true;

  return {
    id: "syndication",
    async resolve(url, { signal }) {
      const ref = parseXStatusUrl(new URL(url));
      if (!ref) throw new AppError("UNSUPPORTED_URL");

      const endpoint = new URL(SYNDICATION_ENDPOINT);
      endpoint.searchParams.set("id", ref.id);
      endpoint.searchParams.set("token", syndicationToken(ref.id));

      let response: Response;
      try {
        response = await doFetch(endpoint, {
          signal,
          headers: { accept: "application/json", "user-agent": USER_AGENT },
          cache: "no-store",
        });
      } catch (error) {
        throw toAppError(error, "PROVIDER_ERROR");
      }

      if (response.status === 404) throw new AppError("NOT_FOUND", "syndication: HTTP 404");
      if (response.status === 429) throw new AppError("RATE_LIMITED", "syndication: HTTP 429");
      if (!response.ok) {
        throw new AppError("PROVIDER_ERROR", `syndication: HTTP ${response.status}`);
      }

      const json: unknown = await response.json().catch((error: unknown) => {
        throw new AppError("PROVIDER_ERROR", "syndication: la respuesta no es JSON", {
          cause: error,
        });
      });
      const typename = z.object({ __typename: z.string() }).safeParse(json).data?.__typename;
      if (typename === "TweetTombstone") {
        throw new AppError("NOT_FOUND", "syndication: post borrado, privado o sensible");
      }
      const tweet = tweetSchema.safeParse(json);
      if (!tweet.success) {
        throw new AppError("PROVIDER_ERROR", "syndication: datos del post con forma inesperada", {
          cause: tweet.error,
        });
      }

      const media = normalizeSyndicationTweet(tweet.data, url, ref.mediaNumber);
      return probeSizes
        ? { ...media, items: await withSizes(media.items, doFetch, signal) }
        : media;
    },
  };
}

export const syndicationProvider = createSyndicationProvider();
