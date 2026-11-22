import type { Quality } from "@/core/types";
import { positive, qualityForSize } from "@/platforms/media";

/** Piezas que comparten los proveedores de Instagram. */

const CDN_HOST = /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** El texto llega con entidades HTML: "&#x201C;Hola&#x201D;&#xA;&amp; chau". */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#x([\da-f]+)|#(\d+)|(\w+));/gi,
    (whole, hex?: string, decimal?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name] ?? whole;
      const code = hex ? parseInt(hex, 16) : Number(decimal);
      return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );
}

/**
 * Solo se aceptan links del CDN de Instagram: los servicios de terceros no pueden mandar a nadie a
 * otro sitio.
 */
export function isInstagramCdn(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && CDN_HOST.test(hostname);
  } catch {
    return false;
  }
}

/**
 * `instagram.*.fna.fbcdn.net` les responde a los navegadores con un redirect a video.xx.fbcdn.net
 * sin cabecera CORS, así que el `fetch` de la descarga falla (a Node no se lo hace: no se ve desde
 * el servidor). El mismo link pedido directo a ese host responde con CORS abierto. Los de
 * `scontent-*.cdninstagram.com` no tienen el problema.
 */
export function browserFriendlyUrl(url: string): string {
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith(".fna.fbcdn.net")) return url;
  parsed.hostname = "video.xx.fbcdn.net";
  return parsed.href;
}

/**
 * "Nombre (@usuario)", con el nombre vacío en algunas cuentas. La página de Instagram agrega
 * " • Instagram reel" (o "photo", o lo que sea en otro idioma) al final.
 */
const AUTHOR_TITLE = /^(.*?)\s*\(@([\w.]+)\)\s*(?:•.*)?$/s;

/** Lee el autor de un título del estilo "Nombre (@usuario)". Si tiene otra forma, nada. */
export function authorFromTitle(
  title: string | undefined,
): { username: string; displayName?: string } | undefined {
  const match = AUTHOR_TITLE.exec(title ?? "");
  if (!match?.[2]) return undefined;
  return { username: match[2], displayName: match[1]?.trim() || undefined };
}

/** "xpv_progressive.INSTAGRAM.CLIPS.C3.720.dash_baseline_1_v1" → 720: el ancho, no el lado corto. */
const ENCODE_WIDTH = /\.C\d+\.(\d{3,4})\./;
/** Algunas etiquetas lo dicen explícito: "…progressive_h264-basic-gen2_720p". */
const ENCODE_LINES = /_(\d{3,4})p\b/;
/**
 * Instagram no sirve MP4 progresivos de más de 720p. Como la etiqueta trae el ancho, un video
 * horizontal de 1280x720 dice "1280": se topea acá para no anunciarlo como 1080p.
 */
const MAX_PROGRESSIVE_SIDE = 720;

/** Base64 normal o "url", con o sin relleno. Funciona en el servidor y en el navegador. */
export function decodeBase64(text: string): string {
  const standard = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
}

/**
 * Calidad y duración que el CDN de Instagram anota en el parámetro `efg` del link. Sin la altura,
 * la calidad es aproximada: un video horizontal de 720 de ancho (405p) saldría como HD.
 */
export function cdnVideoDetails(url: string): { quality?: Quality; durationSeconds?: number } {
  try {
    const efg = new URL(url).searchParams.get("efg");
    if (!efg) return {};
    const info = JSON.parse(decodeBase64(efg)) as { vencode_tag?: unknown; duration_s?: unknown };
    const tag = typeof info.vencode_tag === "string" ? info.vencode_tag : "";
    const side = positive(
      Number(ENCODE_LINES.exec(tag)?.[1]) ||
        Math.min(Number(ENCODE_WIDTH.exec(tag)?.[1]) || 0, MAX_PROGRESSIVE_SIDE),
    );
    return {
      quality: side ? qualityForSize(side, side) : undefined,
      durationSeconds: positive(Number(info.duration_s)),
    };
  } catch {
    return {};
  }
}
