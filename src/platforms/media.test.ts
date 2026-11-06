import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/core/types";
import { qualityForSize, selectedVideoIndex, withSizes } from "./media";

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
