export type DeviceOS = "ios" | "android" | "desktop";

/** Detección básica para elegir la ayuda de descarga. iPadOS se presenta como Mac con touch. */
export function detectOS(userAgent: string, maxTouchPoints = 0): DeviceOS {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return "desktop";
}
