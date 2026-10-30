import { normalizedHost } from "@/core/url";

/**
 * Dominios de X. Incluye los "fix" (fxtwitter, vxtwitter…) porque mucha gente comparte los
 * links así para que se vean bien en WhatsApp o Discord: apuntan al mismo post.
 */
const HOSTS = new Set([
  "x.com",
  "twitter.com",
  "mobile.x.com",
  "mobile.twitter.com",
  "m.twitter.com",
  "fixupx.com",
  "fxtwitter.com",
  "fixvx.com",
  "vxtwitter.com",
]);

/**
 * https://x.com/usuario/status/1790637656616943991 (con /video/2 o /photo/1 opcionales),
 * https://x.com/i/status/1790637656616943991 y https://twitter.com/i/web/status/1790637656616943991.
 * El usuario tiene hasta 15 caracteres; el id es un número de hasta 20 dígitos.
 */
const STATUS_PATH =
  /^\/(?:i\/web|[A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,20})(?:\/(?:video|photo)\/([1-4]))?\/?$/;

export interface XStatusRef {
  /** Id del post. */
  id: string;
  /** Posición de la foto o video que pide el link (/video/2 → 2), contando desde 1. */
  mediaNumber?: number;
}

/** Lee el id del post (y el /video/N) de un link de X. No hace pedidos de red. */
export function parseXStatusUrl(url: URL): XStatusRef | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOSTS.has(normalizedHost(url))) return null;

  const match = STATUS_PATH.exec(url.pathname);
  if (!match?.[1]) return null;
  return { id: match[1], mediaNumber: match[2] ? Number(match[2]) : undefined };
}

/** ¿Es un link a un post de X? No hace pedidos de red. */
export function isXStatusUrl(url: URL): boolean {
  return parseXStatusUrl(url) !== null;
}
