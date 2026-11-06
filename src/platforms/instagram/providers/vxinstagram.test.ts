import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/errors";
import { mediaResultSchema } from "@/core/types";
import { createVxInstagramProvider, decodeEntities, VXINSTAGRAM_ORIGIN } from "./vxinstagram";

/** Respuestas reales del servicio, recortadas; las URLs firmadas y los autores son de prueba. */
const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/vxinstagram-${name}.html`, import.meta.url), "utf8");

const REEL = fixture("reel");
const ALBUM = fixture("album");
const PHOTO = fixture("photo");

const REEL_URL = "https://www.instagram.com/reel/Chunk8-jurw/?igsh=abc";
const REEL_VIDEO =
  "https://scontent-ams4-1.cdninstagram.com/o1/v/t2/f2/m86/AQOreel.mp4?_nc_cat=1&_nc_sid=abc&oe=6AEDBFD4";
const ALBUM_URL = "https://www.instagram.com/p/DSzVXzKDy-M/";

const html = (body: string, status = 200) => new Response(body, { status });

function setup(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  const provider = createVxInstagramProvider({ fetch: fetchMock, probeSizes: false });
  const resolve = (url = REEL_URL, signal = new AbortController().signal) =>
    provider.resolve(url, { signal });
  return { fetchMock, resolve };
}

describe("vxinstagram: normalización", () => {
  it("normaliza la página de un reel a un MediaResult válido", async () => {
    const { resolve } = setup(html(REEL));
    const media = await resolve();

    expect(mediaResultSchema.parse(media)).toEqual(media);
    expect(media).toMatchObject({
      platform: "instagram",
      provider: "vxinstagram",
      id: "Chunk8-jurw",
      sourceUrl: REEL_URL,
      author: { username: "instagram", displayName: "Instagram" },
      title:
        "“Gingerton”\n\n@august_thegingercat (August) loves dressing up & posing for the camera.",
    });
    expect(media.items).toEqual([
      {
        id: "Chunk8-jurw",
        width: 480,
        height: 854,
        variants: [
          {
            id: "sd",
            quality: "sd",
            watermark: false,
            url: REEL_VIDEO,
            mimeType: "video/mp4",
          },
        ],
      },
    ]);
  });

  it("devuelve todos los videos de un álbum e ignora las fotos y las imágenes de la página", async () => {
    const { resolve } = setup(html(ALBUM));
    const media = await resolve(ALBUM_URL);

    expect(mediaResultSchema.parse(media)).toEqual(media);
    expect(media.author).toEqual({
      username: "autor.de_prueba",
      displayName: "Autor De Prueba",
    });
    expect(media.items.map((item) => item.id)).toEqual(["DSzVXzKDy-M-1", "DSzVXzKDy-M-2"]);
    expect(media.items.map((item) => item.variants[0]?.url)).toEqual([
      expect.stringContaining("AQMuno.mp4"),
      expect.stringContaining("AQMdos.mp4"),
    ]);
    expect(media.selectedIndex).toBeUndefined();
  });

  it.each([
    ["el tercer medio es el segundo video", "?img_index=3", 1],
    ["el segundo medio es el primer video", "?img_index=2", 0],
    ["el primer medio es una foto", "?img_index=1", undefined],
    ["ese medio no existe", "?img_index=9", undefined],
  ])("selecciona según el link: %s", async (_label, query, selectedIndex) => {
    const { resolve } = setup(html(ALBUM));
    const media = await resolve(`${ALBUM_URL}${query}`);
    expect(media.selectedIndex).toBe(selectedIndex);
  });

  it("lanza NO_VIDEO si el post solo tiene fotos", async () => {
    const { resolve } = setup(html(PHOTO));
    await expect(resolve("https://www.instagram.com/p/DUWXv4nEUWp/")).rejects.toMatchObject({
      code: "NO_VIDEO",
    });
  });

  it("acepta cuentas sin nombre y no inventa el autor si el título cambia de forma", async () => {
    const page = (title: string) =>
      html(REEL.replace("Instagram (@instagram)", title).replace("Instagram (@instagram)", title));

    const unnamed = await setup(page(" (@suaraberkelas)")).resolve();
    expect(unnamed.author).toEqual({ username: "suaraberkelas", displayName: undefined });

    const unknown = await setup(page("Otra cosa")).resolve();
    expect(unknown.author.username).toBe("desconocido");
  });

  it("ignora los videos que no están en el CDN de Instagram", async () => {
    const hostile = REEL.replaceAll("scontent-ams4-1.cdninstagram.com", "ads.example.com");
    const { resolve } = setup(html(hostile), new Response(null, { status: 404 }));
    await expect(resolve()).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("no acepta un dominio que solo se parece al del CDN", async () => {
    const hostile = REEL.replaceAll(
      "scontent-ams4-1.cdninstagram.com",
      "cdninstagram.com.evil.example",
    );
    const { resolve } = setup(html(hostile), new Response(null, { status: 404 }));
    await expect(resolve()).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});

describe("vxinstagram: si el cuerpo de la página cambia", () => {
  const withoutBody = REEL.slice(0, REEL.indexOf("<body"));

  it("sigue el redirect de og:video hasta el CDN", async () => {
    const { fetchMock, resolve } = setup(
      html(withoutBody),
      new Response(null, { status: 302, headers: { location: REEL_VIDEO } }),
    );

    const media = await resolve();

    expect(media.items[0]?.variants[0]?.url).toBe(REEL_VIDEO);
    const [offload, init] = fetchMock.mock.calls[1]!;
    expect(String(offload)).toBe(`${VXINSTAGRAM_ORIGIN}/offload/Chunk8-jurw/0.mp4`);
    expect(init?.redirect).toBe("manual");
  });

  it("no acepta un redirect fuera del CDN", async () => {
    const { resolve } = setup(
      html(withoutBody),
      new Response(null, { status: 302, headers: { location: "https://ads.example.com/x.mp4" } }),
    );
    await expect(resolve()).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("no sigue un og:video de otro dominio", async () => {
    const hostile = withoutBody.replaceAll(
      "https://vxinstagram.com/offload",
      "https://ads.example.com/offload",
    );
    const { fetchMock, resolve } = setup(html(hostile));
    await expect(resolve()).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("vxinstagram: pedidos y errores", () => {
  it("pide la ruta canónica, con la señal del registry y sin hacerse pasar por otro", async () => {
    const { fetchMock, resolve } = setup(html(REEL));
    const signal = new AbortController().signal;

    await resolve("https://www.instagram.com/reels/Chunk8-jurw/?igsh=abc", signal);

    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(String(endpoint)).toBe(`${VXINSTAGRAM_ORIGIN}/reel/Chunk8-jurw/`);
    expect(init?.signal).toBe(signal);
    expect(new Headers(init?.headers).get("user-agent")).toMatch(/^GigaDown\//);
  });

  it("completa el tamaño con un HEAD al CDN", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(html(REEL))
      .mockResolvedValueOnce(new Response(null, { headers: { "content-length": "918120" } }));
    const provider = createVxInstagramProvider({ fetch: fetchMock });

    const media = await provider.resolve(REEL_URL, { signal: new AbortController().signal });

    expect(media.items[0]?.variants[0]?.size).toBe(918_120);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("HEAD");
  });

  it.each([
    [
      "HTTP 404 (no existe o no se pudo resolver)",
      () => new Response("", { status: 404 }),
      "NOT_FOUND",
    ],
    ["HTTP 429", () => new Response("", { status: 429 }), "RATE_LIMITED"],
    ["HTTP 500", () => new Response("", { status: 500 }), "PROVIDER_ERROR"],
    ["200 sin medios ni etiquetas", () => html("<html>caído</html>"), "PROVIDER_ERROR"],
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

  it("rechaza un link que no es de un post, sin hacer pedidos", async () => {
    const { fetchMock, resolve } = setup();
    await expect(resolve("https://www.instagram.com/instagram/")).rejects.toMatchObject({
      code: "UNSUPPORTED_URL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("decodeEntities", () => {
  it.each([
    ["&#x201C;Hola&#x201D;", "“Hola”"],
    ["uno&#xA;dos", "uno\ndos"],
    ["&#x1F422;", "🐢"],
    [
      "Tom &amp; Jerry &lt;3 &quot;ok&quot; &apos;si&apos; &#39;no&#39;",
      `Tom & Jerry <3 "ok" 'si' 'no'`,
    ],
    ["&desconocida; queda igual", "&desconocida; queda igual"],
    ["&#x110000; fuera de rango", "&#x110000; fuera de rango"],
    ["sin nada", "sin nada"],
  ])("%j → %j", (input, expected) => {
    expect(decodeEntities(input)).toBe(expected);
  });
});
