import { describe, expect, it } from "vitest";
import { itemLabel, twimgVariants } from "./media";

const CDN = "https://video.twimg.com/ext_tw_video/1577719236209922048/pu/vid";

describe("twimgVariants", () => {
  it("arma una variante por calidad a partir de la resolución de la URL", () => {
    const variants = twimgVariants(
      [
        { url: `${CDN}/480x270/a.mp4?tag=12`, bitrate: 256_000 },
        { url: `${CDN}/640x360/b.mp4?tag=12`, bitrate: 832_000 },
        { url: `${CDN}/1280x720/c.mp4?tag=12`, bitrate: 2_176_000 },
      ],
      { width: 1280, height: 720 },
    );

    expect(variants).toEqual([
      expect.objectContaining({ id: "low", quality: "low", url: `${CDN}/480x270/a.mp4?tag=12` }),
      expect.objectContaining({ id: "sd", quality: "sd", url: `${CDN}/640x360/b.mp4?tag=12` }),
      expect.objectContaining({ id: "hd", quality: "hd", url: `${CDN}/1280x720/c.mp4?tag=12` }),
    ]);
    expect(variants.every((v) => !v.watermark && v.mimeType === "video/mp4")).toBe(true);
  });

  it("si dos caen en la misma calidad, se queda con la de mayor bitrate", () => {
    const variants = twimgVariants(
      [
        { url: `${CDN}/540x540/grande.mp4`, bitrate: 832_000 },
        { url: `${CDN}/360x360/chica.mp4`, bitrate: 432_000 },
      ],
      {},
    );
    expect(variants).toHaveLength(1);
    expect(variants[0]?.url).toBe(`${CDN}/540x540/grande.mp4`);
  });

  it("usa el tamaño del video si la URL no trae resolución (GIF)", () => {
    const [gif] = twimgVariants(
      [{ url: "https://video.twimg.com/tweet_video/F4pQYF1aQAES7Xe.mp4", bitrate: 0 }],
      { width: 540, height: 400 },
    );
    expect(gif?.quality).toBe("sd");
  });
});

describe("itemLabel", () => {
  it.each([
    [false, undefined, undefined],
    [true, undefined, "GIF"],
    [false, "criterionchannl", "Cita de @criterionchannl"],
    [true, "criterionchannl", "GIF · Cita de @criterionchannl"],
  ] as const)("gif=%s, cita=%s → %s", (isGif, quotedFrom, label) => {
    expect(itemLabel(isGif, quotedFrom)).toBe(label);
  });
});
