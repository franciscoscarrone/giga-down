import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/errors";
import { mediaResultSchema } from "@/core/types";
import { USER_AGENT } from "@/platforms/media";
import { createInstagramPageProvider, extractPagePost } from "./instagram-page";

/**
 * Páginas reales (noviembre de 2026) recortadas: solo el camino hasta `xig_polaris_media` y, del
 * post, los campos que se usan. Los links firmados ya vencieron.
 */
const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/instagram-${name}.html`, import.meta.url), "utf8");

const REEL = fixture("reel");
const SILENT = fixture("reel-silent");
const ALBUM = fixture("album");
const PHOTO = fixture("photo");

const REEL_URL = "https://www.instagram.com/reel/DfsuIu-M66U/?igsh=abc";
const ALBUM_URL = "https://www.instagram.com/p/DgB12b7mt-f/";

/** Una página con los datos del post en el lugar que se espera, para probar casos que no vinieron. */
const page = (media: unknown, extra: Record<string, unknown> = {}) =>
  `<html><script type="application/json" data-sjs>${JSON.stringify({
    require: [
      [
        {
          __bbox: {
            result: { data: { xig_polaris_media: { ...extra, if_not_gated_logged_out: media } } },
          },
        },
      ],
    ],
  })}</script></html>`;

const video = (url: string, more: Record<string, unknown> = {}) => ({
  code: "ABCDE",
  media_type: 2,
  video_versions: [{ type: 101, url }],
  ...more,
});

const html = (body: string, status = 200) => new Response(body, { status });

function setup(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  const provider = createInstagramPageProvider({ fetch: fetchMock, probeSizes: false });
  const resolve = (url = REEL_URL, signal = new AbortController().signal) =>
    provider.resolve(url, { signal });
  return { fetchMock, resolve };
}

describe("instagram: lectura de la página", () => {
  it("encuentra el post aunque haya otros scripts JSON antes", () => {
    expect(extractPagePost(REEL)).toMatchObject({ code: "DfsuIu-M66U", media_type: 2 });
  });

  it.each([
    [
      "una página sin los datos (por ejemplo, la de login)",
      "<html><title>Login</title></html>",
      undefined,
    ],
    [
      "un script que no es JSON",
      '<script type="application/json">{"xig_polaris_media": </script>',
      undefined,
    ],
    ["un post que no se muestra sin sesión", page(null, { gating_ruling: "AGE" }), null],
  ])("devuelve lo que corresponde ante %s", (_label, body, expected) => {
    expect(extractPagePost(body)).toBe(expected);
  });
});

describe("instagram: normalización", () => {
  it("normaliza un reel real a un MediaResult válido, con autor, texto y medidas", async () => {
    const { resolve } = setup(html(REEL));
    const media = await resolve();

    expect(mediaResultSchema.parse(media)).toEqual(media);
    expect(media).toMatchObject({
      platform: "instagram",
      provider: "instagram",
      id: "DfsuIu-M66U",
      sourceUrl: REEL_URL,
      author: { username: "daddyyankee", displayName: "DY" },
      title: expect.stringMatching(/^Este video lo grabé hace dos décadas atrás junto a @bizarrap/),
      selectedIndex: undefined,
    });
    expect(media.items).toEqual([
      {
        id: "DfsuIu-M66U",
        hasAudio: true,
        coverUrl: expect.stringMatching(/^https:\/\/instagram\.fmvd4-1\.fna\.fbcdn\.net\/v\/t51/),
        durationSeconds: 49,
        width: 1064,
        height: 720,
        variants: [
          {
            id: "hd",
            quality: "hd",
            watermark: false,
            // Pedido directo a video.xx.fbcdn.net para que el navegador lo pueda bajar.
            url: expect.stringMatching(
              /^https:\/\/video\.xx\.fbcdn\.net\/o1\/v\/t2\/f2\/m86\/AQNhs7/,
            ),
            mimeType: "video/mp4",
          },
        ],
      },
    ]);
  });

  it("avisa cuando el video no tiene sonido", async () => {
    const { resolve } = setup(html(SILENT));
    const media = await resolve("https://www.instagram.com/reel/DAbrtxjSqfx/");
    expect(media.items[0]).toMatchObject({ hasAudio: false, width: 720, height: 1280 });
  });

  it("devuelve los videos de un álbum real y saltea las fotos", async () => {
    const { resolve } = setup(html(ALBUM));
    const media = await resolve(ALBUM_URL);
    expect(media.items.map(({ id, durationSeconds }) => ({ id, durationSeconds }))).toEqual([
      { id: "DgB12b7mt-f-1", durationSeconds: 27 },
      { id: "DgB12b7mt-f-2", durationSeconds: 8 },
    ]);
  });

  it.each([
    ["el segundo medio es el primer video", "?img_index=2", 0],
    ["el tercer medio es el segundo video", "?img_index=3", 1],
    ["el primer medio es una foto", "?img_index=1", undefined],
    ["ese medio no existe", "?img_index=9", undefined],
  ])("selecciona según el link: %s", async (_label, query, selectedIndex) => {
    const { resolve } = setup(html(ALBUM));
    const media = await resolve(`${ALBUM_URL}${query}`);
    expect(media.selectedIndex).toBe(selectedIndex);
  });

  it("lanza NO_VIDEO si el post solo tiene fotos", async () => {
    const { resolve } = setup(html(PHOTO));
    await expect(resolve("https://www.instagram.com/p/DfsD2gigngq/")).rejects.toMatchObject({
      code: "NO_VIDEO",
    });
  });

  it("no manda a nadie fuera del CDN de Instagram", async () => {
    const { resolve } = setup(html(page(video("https://evil.example/a.mp4"))));
    await expect(resolve()).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("deja un solo MP4 por calidad aunque la página repita el link", async () => {
    const url = "https://scontent.cdninstagram.com/a.mp4";
    const post = video(url, { video_versions: [{ url }, { url }, { url }] });
    const { resolve } = setup(html(page(post)));
    const media = await resolve();
    expect(media.items[0]?.variants).toHaveLength(1);
  });

  it("si falta el usuario, usa el del link", async () => {
    const { resolve } = setup(html(page(video("https://scontent.cdninstagram.com/a.mp4"))));
    const media = await resolve("https://www.instagram.com/alguien/reel/ABCDE/");
    expect(media.author).toEqual({ username: "alguien" });
    expect(media.title).toBe("");
  });
});

describe("instagram: pedidos y errores", () => {
  it("pide la página canónica del post, identificándose como lo que es", async () => {
    const { fetchMock, resolve } = setup(html(REEL));
    await resolve("https://www.instagram.com/daddyyankee/reel/DfsuIu-M66U/?igsh=abc");

    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(input).toBe("https://www.instagram.com/reel/DfsuIu-M66U/");
    expect(init?.headers).toMatchObject({ "user-agent": USER_AGENT });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [
      "la página de login",
      () => html("<html><title>Login • Instagram</title></html>"),
      "PROVIDER_ERROR",
    ],
    ["un post restringido", () => html(page(null, { gating_ruling: "AGE" })), "PROVIDER_ERROR"],
    ["HTTP 404", () => html("", 404), "NOT_FOUND"],
    ["HTTP 429", () => html("", 429), "RATE_LIMITED"],
    ["HTTP 500", () => html("", 500), "PROVIDER_ERROR"],
  ])(
    "ante %s devuelve %s, para que pruebe el siguiente proveedor",
    async (_label, response, code) => {
      const { resolve } = setup(response());
      await expect(resolve()).rejects.toMatchObject({ code });
    },
  );

  it("devuelve PROVIDER_ERROR si falla la red", async () => {
    const { resolve } = setup(new TypeError("fetch failed"));
    await expect(resolve()).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("propaga el TIMEOUT cuando el registry aborta el pedido", async () => {
    const timeout = new AppError("TIMEOUT");
    const { resolve } = setup(timeout);
    await expect(resolve()).rejects.toBe(timeout);
  });

  it("completa el tamaño con un HEAD al CDN", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) =>
      init?.method === "HEAD"
        ? new Response(null, { headers: { "content-length": "9491431" } })
        : html(REEL),
    );
    const provider = createInstagramPageProvider({ fetch: fetchMock });
    const media = await provider.resolve(REEL_URL, { signal: new AbortController().signal });
    expect(media.items[0]?.variants[0]?.size).toBe(9_491_431);
  });

  it("rechaza un link que no es de un post, sin hacer pedidos", async () => {
    const { fetchMock, resolve } = setup();
    await expect(resolve("https://www.instagram.com/instagram/")).rejects.toMatchObject({
      code: "UNSUPPORTED_URL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
