import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/core/types";
import { itemLabel, qualityForSize, selectedVideoIndex, twimgVariants, withSizes } from "./media";

const CDN = "https://video.twimg.com/ext_tw_video/1577719236209922048/pu/vid";

describe("qualityForSize", () => {
  it.each([
    [480, 270, "low"],
    [320, 320, "low"],
    [640, 360, "sd"],
    [540, 540, "sd"],
    [1280, 720, "hd"],
    [720, 1280, "hd"],
    [720, 720, "hd"],
    [1920, 1080, "fhd"],
    [3840, 2160, "uhd"],
  ] as const)("%ix%i → %s", (width, height, quality) => {
    expect(qualityForSize(width, height)).toBe(quality);
  });
});

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

describe("selectedVideoIndex", () => {
  it("cuenta solo los videos anteriores al medio pedido", () => {
    // Post con [foto, video, video]: /video/3 es el segundo video.
    expect(selectedVideoIndex([false, true, true], 3)).toBe(1);
    expect(selectedVideoIndex([true, true], 1)).toBe(0);
  });

  it("no selecciona nada si el medio pedido es una foto o no existe", () => {
    expect(selectedVideoIndex([false, true], 1)).toBeUndefined();
    expect(selectedVideoIndex([true], 4)).toBeUndefined();
    expect(selectedVideoIndex([true], undefined)).toBeUndefined();
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

describe("withSizes", () => {
  const item: MediaItem = {
    id: "1",
    variants: [
      {
        id: "sd",
        quality: "sd",
        watermark: false,
        url: `${CDN}/640x360/b.mp4`,
        mimeType: "video/mp4",
      },
      {
        id: "hd",
        quality: "hd",
        watermark: false,
        url: `${CDN}/1280x720/c.mp4`,
        mimeType: "video/mp4",
      },
    ],
  };

  it("completa el tamaño con un HEAD por variante", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input).includes("640x360")
          ? new Response(null, { headers: { "content-length": "553404" } })
          : new Response(null, { headers: { "content-length": "1404023" } }),
      );

    const [withSize] = await withSizes([item], fetchMock, new AbortController().signal);

    expect(withSize?.variants.map((v) => v.size)).toEqual([553_404, 1_404_023]);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("HEAD");
  });

  it("si un HEAD falla, esa variante queda sin tamaño y el resto sigue", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    const [withSize] = await withSizes([item], fetchMock, new AbortController().signal);

    expect(withSize?.variants.map((v) => v.size)).toEqual([undefined, undefined]);
  });
});
