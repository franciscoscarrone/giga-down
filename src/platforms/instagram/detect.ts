import { normalizedHost } from "@/core/url";

/**
 * Dominios de Instagram. Incluye los "fix" (ddinstagram, vxinstagram…) porque mucha gente comparte
 * los links así para que se vean bien en WhatsApp o Discord: apuntan al mismo post.
 */
const HOSTS = new Set([
  "instagram.com",
  "m.instagram.com",
  "instagr.am",
  "ddinstagram.com",
  "d.ddinstagram.com",
  "vxinstagram.com",
  "d.vxinstagram.com",
  "kkinstagram.com",
  "eeinstagram.com",
  "toinstagram.com",
  "uuinstagram.com",
]);

/**
 * /reel/CODIGO, /reels/CODIGO, /p/CODIGO y /tv/CODIGO, también con el usuario adelante
 * (/usuario/reel/CODIGO). Al final puede venir el elemento del álbum (/p/CODIGO/2, como lo arman
 * los servicios "fix") o /embed.
 */
const POST_PATH =
  /^(?:\/[A-Za-z0-9._]{1,30})?\/(reels?|p|tv)\/([A-Za-z0-9_-]{5,64})(?:\/(\d{1,2}))?(?:\/embed(?:\/captioned)?)?\/?$/;

/** Lo que copia la app en algunos casos: /share/CODIGO, /share/reel/CODIGO o /share/p/CODIGO. */
const SHARE_PATH = /^\/share\/(?:(reel|p|video)\/)?([A-Za-z0-9_-]{5,64})\/?$/;

export interface InstagramRef {
  /** Código del post, o de la invitación si el link es de /share/. */
  code: string;
  /** Ruta canónica del post, sin el usuario ni los parámetros. */
  path: string;
  /** Posición del medio que pide el link (?img_index=2 → 2), contando desde 1. */
  mediaNumber?: number;
}

/** Lee el código del post (y el elemento pedido) de un link de Instagram. No hace pedidos de red. */
export function parseInstagramUrl(url: URL): InstagramRef | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOSTS.has(normalizedHost(url))) return null;

  const share = SHARE_PATH.exec(url.pathname);
  if (share?.[2]) {
    return { code: share[2], path: `/share/${share[1] ? `${share[1]}/` : ""}${share[2]}/` };
  }

  const post = POST_PATH.exec(url.pathname);
  if (!post?.[2]) return null;
  const kind = post[1]?.startsWith("reel") ? "reel" : "p";
  const number = Number(post[3] ?? url.searchParams.get("img_index"));
  return {
    code: post[2],
    path: `/${kind}/${post[2]}/`,
    mediaNumber: number > 0 ? number : undefined,
  };
}

/** ¿Es un link a un post de Instagram? No hace pedidos de red. */
export function isInstagramPostUrl(url: URL): boolean {
  return parseInstagramUrl(url) !== null;
}
