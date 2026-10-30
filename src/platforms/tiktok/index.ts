import type { Platform } from "@/core/types";
import { isTikTokVideoUrl } from "./detect";
import { tikwmProvider } from "./providers/tikwm";

export const tiktok: Platform = {
  id: "tiktok",
  name: "TikTok",
  detect: isTikTokVideoUrl,
  // En orden de preferencia: si tikwm falla, el registry prueba el siguiente.
  providers: [tikwmProvider],
};
