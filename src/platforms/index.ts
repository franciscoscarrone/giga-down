import { createRegistry } from "@/core/registry";
import type { Platform } from "@/core/types";
import { tiktok } from "./tiktok";

/**
 * Plataformas habilitadas. Para sumar una red nueva: crear `platforms/<red>/`
 * (detect + provider + index) y agregarla a esta lista. Nada más.
 */
export const platforms: readonly Platform[] = [tiktok];

export const registry = createRegistry(platforms, {
  onProviderError: ({ platform, provider, error }) => {
    console.warn(`[resolve] ${platform}/${provider} falló: ${error.code} — ${error.message}`);
  },
});
