import type { Platform } from "@/core/types";
import { isTikTokVideoUrl } from "./detect";
import { tikwmProvider } from "./providers/tikwm";

export const tiktok: Platform = {
  id: "tiktok",
  name: "TikTok",
  watermarked: true,
  // Estándar viene en H.264 y se reproduce en todos lados; la HD de tikwm suele ser H.265.
  defaultQuality: "sd",
  detect: isTikTokVideoUrl,
  // En orden de preferencia: si tikwm falla, el registry prueba el siguiente.
  providers: [tikwmProvider],
};
