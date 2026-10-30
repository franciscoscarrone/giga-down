import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/errors";
import { mediaResultSchema } from "@/core/types";
import gifQuoteFixture from "./__fixtures__/fxtwitter-gif-quote.json";
import multiFixture from "./__fixtures__/fxtwitter-multi.json";
import { createFxTwitterProvider, FXTWITTER_ORIGIN } from "./fxtwitter";

const MULTI = "https://x.com/UltimaShadowX/status/1577719286659006464";
const GIF_QUOTE = "https://x.com/BAKKOOONN/status/1696256659889565950";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Respuestas reales de FxTwitter (ver __fixtures__), recortadas a los campos que usamos. */
const multi = () => structuredClone(multiFixture);

function setup(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  const provider = createFxTwitterProvider({ fetch: fetchMock, probeSizes: false });
  const resolve = (url = MULTI, signal = new AbortController().signal) =>
    provider.resolve(url, { signal });
  return { fetchMock, resolve };
}

describe("fxtwitter: normalización", () => {
  it("un post con cuatro videos da cuatro items con sus calidades", async () => {
    const { resolve } = setup(json(multi()));
    const media = await resolve();

    expect(mediaResultSchema.parse(media)).toEqual(media);
    expect(media).toMatchObject({
      platform: "x",
      provider: "fxtwitter",
      id: "1577719286659006464",
      sourceUrl: MULTI,
      author: { username: "UltimaShadowX" },
      selectedIndex: undefined,
    });
    expect(media.items).toHaveLength(4);
    expect(media.items[0]).toMatchObject({
      id: "1577719236209922048",
      label: undefined,
      coverUrl: expect.stringContaining("pbs.twimg.com"),
      durationSeconds: 4.266,
      width: 1280,
      height: 720,
    });
    expect(media.items[0]?.variants.map((v) => v.quality)).toEqual(["low", "sd", "hd"]);
    // El HLS (m3u8) no se ofrece: no se puede guardar como un archivo.
    expect(media.items.flatMap((i) => i.variants).every((v) => v.url.includes(".mp4"))).toBe(true);
  });

  it("selecciona el video que pide /video/N", async () => {
    const { resolve } = setup(json(multi()));
    const media = await resolve(`${MULTI}/video/3`);
    expect(media.selectedIndex).toBe(2);
  });

  it("suma los videos del post citado, con su etiqueta, después de los propios", async () => {
    const { resolve } = setup(json(gifQuoteFixture));
    const media = await resolve(GIF_QUOTE);

    expect(media.title).toBe("");
    expect(media.author.username).toBe("BAKKOOONN");
    expect(media.items.map((i) => i.label)).toEqual(["GIF", "Cita de @criterionchannl"]);
    expect(media.items[0]?.variants).toEqual([
      expect.objectContaining({
        quality: "sd",
        url: "https://video.twimg.com/tweet_video/F4pQYF1aQAES7Xe.mp4",
      }),
    ]);
    expect(media.items[0]?.durationSeconds).toBeUndefined();
    expect(media.items[1]?.variants.map((v) => v.quality)).toEqual(["low", "sd", "hd"]);
  });

  it("prefiere H.264 si también hay MP4 en otro códec", async () => {
    const body = multi();
    const video = body.status.media.videos[0]!;
    video.formats = [
      { url: "https://video.twimg.com/v/1280x720/hevc.mp4", container: "mp4", codec: "hevc" },
      { url: "https://video.twimg.com/v/1280x720/avc.mp4", container: "mp4", codec: "h264" },
    ] as typeof video.formats;
    const { resolve } = setup(json(body));

    const media = await resolve();

    expect(media.items[0]?.variants.map((v) => v.url)).toEqual([
      "https://video.twimg.com/v/1280x720/avc.mp4",
    ]);
  });

  it("lanza NO_VIDEO si el post no tiene videos (texto o fotos)", async () => {
    const body = multi();
    const { resolve } = setup(json({ ...body, status: { ...body.status, media: null } }));
    await expect(resolve()).rejects.toMatchObject({ code: "NO_VIDEO" });
  });
});

describe("fxtwitter: pedidos y errores", () => {
  it("llama a la API v2 con el id del post y la señal del registry", async () => {
    const { fetchMock, resolve } = setup(json(multi()));
    const signal = new AbortController().signal;

    await resolve(`${MULTI}?s=46&t=abc`, signal);

    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(String(endpoint)).toBe(`${FXTWITTER_ORIGIN}/2/status/1577719286659006464`);
    expect(init?.signal).toBe(signal);
  });

  it("completa los tamaños con un HEAD al CDN si probeSizes está activo", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(gifQuoteFixture))
      .mockImplementation(
        async () => new Response(null, { headers: { "content-length": "2000000" } }),
      );
    const provider = createFxTwitterProvider({ fetch: fetchMock });

    const media = await provider.resolve(GIF_QUOTE, { signal: new AbortController().signal });

    expect(media.items.flatMap((i) => i.variants).map((v) => v.size)).toEqual([
      2_000_000, 2_000_000, 2_000_000, 2_000_000,
    ]);
  });

  it.each([
    [
      "404 (borrado o inexistente)",
      () => json({ code: 404, message: "NOT_FOUND" }, 404),
      "NOT_FOUND",
    ],
    ["401 (privado)", () => json({ code: 401, message: "PRIVATE_TWEET" }, 401), "NOT_FOUND"],
    ["429", () => json({ code: 429, message: "Too many requests" }, 429), "RATE_LIMITED"],
    ["500", () => json({ code: 500, message: "API_FAIL" }, 500), "PROVIDER_ERROR"],
    [
      "502 que no es JSON",
      () => new Response("<html>Bad gateway</html>", { status: 502 }),
      "PROVIDER_ERROR",
    ],
    ["200 que no es JSON", () => new Response("<html>caído</html>"), "PROVIDER_ERROR"],
    [
      "status con otra forma",
      () => json({ code: 200, status: { type: "status" } }),
      "PROVIDER_ERROR",
    ],
    [
      "tombstone",
      () => json({ code: 200, status: { type: "tombstone", reason: "deleted" } }),
      "NOT_FOUND",
    ],
  ])("ante %s devuelve %s", async (_label, response, code) => {
    const { resolve } = setup(response());
    await expect(resolve()).rejects.toMatchObject({ code });
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
