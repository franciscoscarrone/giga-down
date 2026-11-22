import { AppError, toAppError } from "@/core/errors";
import type { MediaAuthor, MediaItem, MediaResult, Provider } from "@/core/types";
import { selectedVideoIndex, USER_AGENT, withSizes } from "@/platforms/media";
import { fetchPostAuthor, INSTAGRAM_ORIGIN } from "../author";
import {
  browserFriendlyUrl,
  cdnVideoDetails,
  decodeBase64,
  decodeEntities,
  isInstagramCdn,
} from "../common";
import { parseInstagramUrl, type InstagramRef } from "../detect";

/**
 * Adaptador de Snapsave (https://snapsave.app), una web de descargas. Es el respaldo de la página
 * de Instagram. No tiene API: se usa el mismo pedido que hace su formulario.
 *
 * - `POST /action.php` con `url=<link del post>` responde un script empaquetado
 *   (`eval(function(h,u,n,t,e,r){…}(…))`). Desempaquetado, escribe el HTML de los resultados en
 *   `#download-section`, o un mensaje en `#alert` si no pudo ("Unable to connect to Instagram
 *   server" también para posts que no existen o son privados).
 * - Cada medio es un `div.download-items` con la portada y un botón. Los dos links pasan por
 *   `d.rapidcdn.app?token=<JWT>`, y el JWT trae el link original del CDN de Instagram: se usa ese,
 *   así la descarga no depende de otro servicio más.
 * - La calidad y la duración salen del link del CDN (`cdnVideoDetails`).
 * - No trae ni el autor ni el texto del post: el autor sale del link o de la página de Instagram.
 * - A algunos reels (~1 de cada 7) los reconoce pero manda el botón sin link (`href="&dl=1"`).
 * - Pide `Origin` y `Referer` de su propio formulario; sin eso, Cloudflare corta con un desafío.
 * - Su demora varía mucho: de 1,5 a más de 30 segundos. Por eso tiene su propio timeout.
 */

export const SNAPSAVE_ENDPOINT = "https://snapsave.app/action.php?lang=en";
const SNAPSAVE_ORIGIN = "https://snapsave.app";
const SNAPSAVE_TIMEOUT_MS = 45_000;

/** Los argumentos del empaquetador: `}("datos",u,"alfabeto",desplazamiento,base,r))`. */
const PACKED_ARGS = /\}\("([^"]*)",\s*\d+,\s*"([^"]*)",\s*(\d+),\s*(\d+),\s*\d+\)\)/;
const ALERT = /querySelector\("#alert"\)\.innerHTML\s*=\s*"((?:[^"\\]|\\.)*)"/;
const DOWNLOAD_SECTION =
  /getElementById\("download-section"\)\.innerHTML\s*=\s*"((?:[^"\\]|\\.)*)"/;
const ITEM_START = 'class="download-items"';
const IMG_SRC = /<img\b[^>]*\bsrc="([^"]*)"/;
const LINK_HREF = /<a\b[^>]*\bhref="([^"]*)"/;
/**
 * Desarma el script de Snapsave. Cada carácter del resultado es un número escrito con las letras
 * del alfabeto como dígitos (en la base `base`), separados por la letra que sigue, menos el
 * desplazamiento. El resultado son bytes UTF-8.
 */
export function unpackSnapsave(script: string): string {
  const args = PACKED_ARGS.exec(script);
  const [, data = "", alphabet = "", offsetText, baseText] = args ?? [];
  const offset = Number(offsetText);
  const base = Number(baseText);
  const separator = alphabet[base];
  if (!args || !separator || base < 2) {
    throw new AppError("PROVIDER_ERROR", "snapsave: la respuesta no tiene el formato esperado");
  }

  const bytes: number[] = [];
  for (const chunk of data.split(separator)) {
    if (!chunk) continue;
    let value = 0;
    for (const char of chunk) {
      const digit = alphabet.indexOf(char);
      value = value * base + (digit >= 0 && digit < base ? digit : 0);
    }
    bytes.push(value - offset);
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

const unescapeJs = (text: string) => text.replace(/\\(.)/gs, "$1");

export type SnapsaveOutcome = { alert: string } | { html: string };

/** Lo que el script escribe en la página: un aviso de error o el HTML de los resultados. */
export function parseSnapsaveScript(script: string): SnapsaveOutcome {
  const code = unpackSnapsave(script);
  const alert = ALERT.exec(code)?.[1];
  if (alert !== undefined) return { alert: unescapeJs(alert).trim() };
  const html = DOWNLOAD_SECTION.exec(code)?.[1];
  if (html !== undefined) return { html: unescapeJs(html) };
  throw new AppError("PROVIDER_ERROR", "snapsave: el script no escribe ni resultados ni un aviso");
}

/**
 * El link del CDN de Instagram, sea directo o envuelto en el token de rapidcdn. Cualquier otra
 * cosa (otro sitio, un token sin link, un href roto) se descarta.
 */
export function cdnUrlFromLink(link: string | undefined): string | undefined {
  if (!link) return undefined;
  const href = decodeEntities(link);
  if (isInstagramCdn(href)) return href;
  try {
    const payload = new URL(href).searchParams.get("token")?.split(".")[1];
    if (!payload) return undefined;
    const inner: unknown = (JSON.parse(decodeBase64(payload)) as { url?: unknown }).url;
    return typeof inner === "string" && isInstagramCdn(inner) ? inner : undefined;
  } catch {
    return undefined;
  }
}

export interface SnapsaveMedia {
  isVideo: boolean;
  /** Link del CDN de Instagram; falta si Snapsave mandó uno roto o de otro lado. */
  url?: string;
  coverUrl?: string;
}

/** Los medios del post, en orden (fotos incluidas: cuentan para `?img_index=`). */
export function parseSnapsaveItems(html: string): SnapsaveMedia[] {
  return html
    .split(ITEM_START)
    .slice(1)
    .map((item) => {
      const isVideo = /\bicon-dlvideo\b/.test(item) || /Download video/i.test(item);
      return {
        isVideo,
        url: cdnUrlFromLink(LINK_HREF.exec(item)?.[1]),
        coverUrl: cdnUrlFromLink(IMG_SRC.exec(item)?.[1]),
      };
    });
}

/** Traduce los medios de Snapsave al modelo de la app (sin tamaños: los completa el proveedor). */
export function normalizeSnapsave(
  media: readonly SnapsaveMedia[],
  ref: InstagramRef,
  sourceUrl: string,
  author: MediaAuthor | undefined,
): MediaResult {
  if (media.length === 0) {
    throw new AppError("PROVIDER_ERROR", "snapsave: la respuesta no trae fotos ni videos");
  }
  const playable = media.map((item) => item.isVideo && item.url !== undefined);
  const videos = media.filter((item, index) => playable[index]);
  if (videos.length === 0) {
    if (media.some((item) => item.isVideo)) {
      throw new AppError("PROVIDER_ERROR", "snapsave: el video no trae un link del CDN");
    }
    throw new AppError("NO_VIDEO", "snapsave: el post no tiene videos.");
  }

  const items = videos.map((video, index): MediaItem => {
    const url = video.url!;
    const { quality = "sd", durationSeconds } = cdnVideoDetails(url);
    return {
      id: videos.length > 1 ? `${ref.code}-${index + 1}` : ref.code,
      coverUrl: video.coverUrl,
      durationSeconds,
      variants: [
        {
          id: quality,
          quality,
          watermark: false,
          url: browserFriendlyUrl(url),
          mimeType: "video/mp4",
        },
      ],
    };
  });

  return {
    platform: "instagram",
    provider: "snapsave",
    id: ref.code,
    sourceUrl,
    author: author ?? { username: ref.username ?? "desconocido" },
    title: "",
    items,
    selectedIndex: selectedVideoIndex(playable, ref.mediaNumber),
  };
}

export interface SnapsaveProviderOptions {
  fetch?: typeof fetch;
  /** Pide el tamaño de cada MP4 con un HEAD al CDN (por defecto, sí). */
  probeSizes?: boolean;
  /** Busca el autor en la página de Instagram mientras responde Snapsave (por defecto, sí). */
  lookupAuthor?: boolean;
}

export function createSnapsaveProvider(options: SnapsaveProviderOptions = {}): Provider {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const probeSizes = options.probeSizes ?? true;
  const lookupAuthor = options.lookupAuthor ?? true;

  return {
    id: "snapsave",
    timeoutMs: SNAPSAVE_TIMEOUT_MS,
    async resolve(url, { signal }) {
      const ref = parseInstagramUrl(new URL(url));
      if (!ref) throw new AppError("UNSUPPORTED_URL");

      // En paralelo: Snapsave tarda bastante más que Instagram en responder.
      const author = lookupAuthor
        ? fetchPostAuthor(ref.path, doFetch, signal)
        : Promise.resolve(undefined);

      let media: SnapsaveMedia[];
      try {
        const response = await doFetch(SNAPSAVE_ENDPOINT, {
          method: "POST",
          signal,
          headers: {
            accept: "*/*",
            "content-type": "application/x-www-form-urlencoded",
            origin: SNAPSAVE_ORIGIN,
            referer: `${SNAPSAVE_ORIGIN}/`,
            "user-agent": USER_AGENT,
          },
          body: new URLSearchParams({ url: `${INSTAGRAM_ORIGIN}${ref.path}` }),
          cache: "no-store",
        });
        if (response.status === 429) throw new AppError("RATE_LIMITED", "snapsave: HTTP 429");
        if (!response.ok) {
          throw new AppError("PROVIDER_ERROR", `snapsave: HTTP ${response.status}`);
        }
        const outcome = parseSnapsaveScript(await response.text());
        if ("alert" in outcome) {
          throw new AppError("NOT_FOUND", `snapsave: ${outcome.alert || "aviso sin texto"}`);
        }
        media = parseSnapsaveItems(outcome.html);
      } catch (error) {
        throw toAppError(error, "PROVIDER_ERROR");
      }

      const result = normalizeSnapsave(media, ref, url, await author);
      return probeSizes
        ? { ...result, items: await withSizes(result.items, doFetch, signal) }
        : result;
    },
  };
}

export const snapsaveProvider = createSnapsaveProvider();
