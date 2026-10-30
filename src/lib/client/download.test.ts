import { describe, expect, it, vi } from "vitest";
import type { MediaResult, MediaVariant } from "@/core/types";
import { buildFilename, DownloadError, downloadMedia, downloadOrder } from "./download";

const variant = (
  id: string,
  quality: MediaVariant["quality"],
  watermark = false,
): MediaVariant => ({
  id,
  quality,
  watermark,
  url: `https://cdn.example/${id}.mp4`,
  mimeType: "video/mp4",
});

const media: MediaResult = {
  platform: "tiktok",
  provider: "tikwm",
  id: "6718335390845095173",
  sourceUrl: "https://www.tiktok.com/@scout2015/video/6718335390845095173",
  author: { username: "scout2015" },
  title: "x",
  variants: [
    variant("sd", "sd"),
    variant("hd", "hd"),
    variant("fhd", "fhd"),
    variant("sd-wm", "sd", true),
  ],
};

const ok = () =>
  new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "video/mp4" } });

describe("downloadOrder", () => {
  it("prueba la elegida y después las demás sin marca, de mayor a menor calidad", () => {
    expect(downloadOrder(media.variants, "sd").map((v) => v.id)).toEqual(["sd", "fhd", "hd"]);
  });

  it("si se eligió la variante con marca, el respaldo es sin marca", () => {
    expect(downloadOrder(media.variants, "sd-wm").map((v) => v.id)).toEqual([
      "sd-wm",
      "fhd",
      "hd",
      "sd",
    ]);
  });
});

describe("buildFilename", () => {
  it("arma un nombre legible y seguro", () => {
    expect(buildFilename(media, variant("hd", "hd"))).toBe(
      "tiktok-scout2015-6718335390845095173-hd.mp4",
    );
    expect(
      buildFilename({ ...media, author: { username: "Raro/Nombre" } }, variant("x", "sd", true)),
    ).toBe("tiktok-raro_nombre-6718335390845095173-sd-marca.mp4");
  });
});

describe("downloadMedia", () => {
  it("baja la calidad elegida", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await downloadMedia(media, "hd");

    expect(outcome).toMatchObject({ kind: "file", fellBack: false, variant: { id: "hd" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si la elegida falla, baja otra calidad y avisa que hubo respaldo", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValue(ok()),
    );

    const outcome = await downloadMedia(media, "hd");

    expect(outcome).toMatchObject({ kind: "file", fellBack: true, variant: { id: "fhd" } });
  });

  it("si ninguna se puede bajar por CORS o red, pide abrir la elegida en otra pestaña", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(downloadMedia(media, "hd")).resolves.toMatchObject({
      kind: "blocked",
      variant: { id: "hd" },
    });
  });

  it("si todas responden con error HTTP (links vencidos), lanza DownloadError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 })),
    );
    await expect(downloadMedia(media, "sd")).rejects.toBeInstanceOf(DownloadError);
  });
});
