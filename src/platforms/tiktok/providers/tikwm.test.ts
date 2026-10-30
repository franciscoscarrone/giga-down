import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/errors";
import { mediaResultSchema } from "@/core/types";
import fixture from "./__fixtures__/tikwm-video.json";
import { absolutize, createTikwmProvider, normalizeTikwmVideo, type TikwmVideo } from "./tikwm";

const SOURCE = "https://www.tiktok.com/@scout2015/video/6718335390845095173";
const RATE_LIMIT = { code: -1, msg: "Free Api Limit: 1 request/second." };
const NOT_FOUND = { code: -1, msg: "Url parsing is failed! Please check url." };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Respuesta real de tikwm (ver __fixtures__) con cambios puntuales para cada caso. */
const video = (overrides: Partial<TikwmVideo> = {}): TikwmVideo => ({
  ...structuredClone(fixture.data),
  ...overrides,
});

function setup(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  const provider = createTikwmProvider({ fetch: fetchMock, minIntervalMs: 0, retryDelayMs: 0 });
  const resolve = (signal = new AbortController().signal) => provider.resolve(SOURCE, { signal });
  return { fetchMock, resolve };
}

describe("normalizeTikwmVideo", () => {
  it("normaliza la respuesta real a un MediaResult válido", () => {
    const media = normalizeTikwmVideo(video(), SOURCE);

    expect(mediaResultSchema.parse(media)).toEqual(media);
    expect(media).toMatchObject({
      platform: "tiktok",
      provider: "tikwm",
      id: "6718335390845095173",
      sourceUrl: SOURCE,
      author: { username: "scout2015", displayName: "Scout, Suki & Stella" },
      durationSeconds: 10,
    });
    expect(media.title).toContain("Scramble up ur name");
    expect(media.coverUrl).toBe(fixture.data.cover);
  });

  it("arma las variantes sin marca, de menor a mayor calidad, con su tamaño", () => {
    const { variants } = normalizeTikwmVideo(video(), SOURCE);

    expect(variants).toEqual([
      {
        id: "sd",
        quality: "sd",
        watermark: false,
        url: fixture.data.play,
        size: 2953029,
        mimeType: "video/mp4",
      },
      {
        id: "hd",
        quality: "hd",
        watermark: false,
        url: fixture.data.hdplay,
        size: 2004627,
        mimeType: "video/mp4",
      },
    ]);
  });

  it("no ofrece la variante con marca si tikwm repite el link sin marca", () => {
    expect(fixture.data.wmplay).toBe(fixture.data.play);
    const { variants } = normalizeTikwmVideo(video(), SOURCE);
    expect(variants.some((v) => v.watermark)).toBe(false);
  });

  it("incluye la variante con marca cuando es un link distinto", () => {
    const { variants } = normalizeTikwmVideo(
      video({ wmplay: "https://cdn.example/wm.mp4", wm_size: 3_100_000 }),
      SOURCE,
    );
    expect(variants.at(-1)).toMatchObject({ id: "sd-wm", watermark: true, size: 3_100_000 });
  });

  it("prefija con el origen de tikwm las URLs relativas", () => {
    const media = normalizeTikwmVideo(
      video({
        play: "/video/media/play/6718335390845095173.mp4",
        wmplay: "/video/media/play/6718335390845095173.mp4",
        hdplay: "/video/media/hdplay/6718335390845095173.mp4",
        cover: "/video/cover/6718335390845095173.webp",
      }),
      SOURCE,
    );

    expect(media.variants.map((v) => v.url)).toEqual([
      "https://www.tikwm.com/video/media/play/6718335390845095173.mp4",
      "https://www.tikwm.com/video/media/hdplay/6718335390845095173.mp4",
    ]);
    expect(media.coverUrl).toBe("https://www.tikwm.com/video/cover/6718335390845095173.webp");
  });

  it("omite tamaños en 0 y la variante HD si no viene", () => {
    const { variants } = normalizeTikwmVideo(video({ size: 0, hdplay: undefined }), SOURCE);
    expect(variants).toHaveLength(1);
    expect(variants[0]?.size).toBeUndefined();
  });

  it("rechaza publicaciones de fotos", () => {
    expect(() =>
      normalizeTikwmVideo(video({ images: ["https://cdn.example/1.jpg"] }), SOURCE),
    ).toThrow(expect.objectContaining({ code: "UNSUPPORTED_URL" }));
  });

  it("falla si no hay ningún link de video", () => {
    expect(() =>
      normalizeTikwmVideo(video({ play: undefined, hdplay: undefined, wmplay: undefined }), SOURCE),
    ).toThrow(expect.objectContaining({ code: "PROVIDER_ERROR" }));
  });
});

describe("absolutize", () => {
  it.each([
    [undefined, undefined],
    ["", undefined],
    ["/a.mp4", "https://www.tikwm.com/a.mp4"],
    ["//cdn.example/a.mp4", "https://cdn.example/a.mp4"],
    ["https://cdn.example/a.mp4", "https://cdn.example/a.mp4"],
  ])("%j → %j", (input, expected) => {
    expect(absolutize(input)).toBe(expected);
  });
});

describe("tikwm provider", () => {
  it("llama a la API con el link codificado, hd=1 y la señal del registry", async () => {
    const { fetchMock, resolve } = setup(json(fixture));
    const signal = new AbortController().signal;

    await resolve(signal);

    const [endpoint, init] = fetchMock.mock.calls[0]!;
    const url = new URL(String(endpoint));
    expect(url.origin + url.pathname).toBe("https://www.tikwm.com/api/");
    expect(url.searchParams.get("url")).toBe(SOURCE);
    expect(url.searchParams.get("hd")).toBe("1");
    expect(init?.signal).toBe(signal);
  });

  it("mapea 'Url parsing is failed' a NOT_FOUND", async () => {
    const { resolve } = setup(json(NOT_FOUND));
    await expect(resolve()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reintenta una sola vez si pega en el límite de pedidos", async () => {
    const { fetchMock, resolve } = setup(json(RATE_LIMIT), json(fixture));
    await expect(resolve()).resolves.toMatchObject({ id: "6718335390845095173" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("devuelve RATE_LIMITED si el reintento también pega en el límite", async () => {
    const { fetchMock, resolve } = setup(json(RATE_LIMIT), json(RATE_LIMIT), json(fixture));
    await expect(resolve()).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("trata HTTP 429 como límite de pedidos", async () => {
    const { resolve } = setup(json({}, 429), json({}, 429));
    await expect(resolve()).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it.each([
    ["HTTP 500", () => json({ error: "boom" }, 500)],
    ["cuerpo que no es JSON", () => new Response("<html>caído</html>", { status: 200 })],
    ["JSON con otra forma", () => json({ hola: "mundo" })],
    ["data sin campos obligatorios", () => json({ code: 0, msg: "success", data: { id: "1" } })],
    ["code distinto de 0 desconocido", () => json({ code: -1, msg: "Algo raro" })],
  ])("devuelve PROVIDER_ERROR ante %s", async (_label, response) => {
    const { resolve } = setup(response());
    await expect(resolve()).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("devuelve PROVIDER_ERROR si falla la red", async () => {
    const { resolve } = setup(new TypeError("fetch failed"));
    await expect(resolve()).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("propaga el TIMEOUT cuando el registry aborta el pedido", async () => {
    const timeout = new AppError("TIMEOUT");
    const { resolve } = setup(timeout);
    await expect(resolve()).rejects.toBe(timeout);
  });
});
