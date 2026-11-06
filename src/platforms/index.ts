import { createRegistry } from "@/core/registry";
import type { Platform } from "@/core/types";
import { instagram } from "./instagram";
import { tiktok } from "./tiktok";
import { x } from "./x";

/**
 * Plataformas habilitadas. Para sumar una red nueva: crear `platforms/<red>/`
 * (detect + provider + index) y agregarla a esta lista. Nada más.
 */
export const platforms: readonly Platform[] = [tiktok, x, instagram];

/** "TikTok, X e Instagram" o "TikTok, X o Instagram", para los textos de la UI. */
export function platformNames(type: "conjunction" | "disjunction"): string {
  return new Intl.ListFormat("es", { type }).format(platforms.map((p) => p.name));
}

export function platformById(id: string): Platform | undefined {
  return platforms.find((p) => p.id === id);
}

export const registry = createRegistry(platforms, {
  onProviderError: ({ platform, provider, error }) => {
    // `fetch failed` esconde el motivo real (DNS, TLS, conexión) en `cause.cause`.
    const reasons: string[] = [];
    for (let c = error.cause; c instanceof Error && reasons.length < 3; c = c.cause) {
      reasons.push(c.message);
    }
    const cause = reasons.length ? ` (causa: ${reasons.join(" ← ")})` : "";
    console.warn(
      `[resolve] ${platform}/${provider} falló: ${error.code} — ${error.message}${cause}`,
    );
  },
});
