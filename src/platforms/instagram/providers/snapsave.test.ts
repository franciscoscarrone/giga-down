import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/errors";
import { mediaResultSchema } from "@/core/types";
import { USER_AGENT } from "@/platforms/media";
import { INSTAGRAM_ORIGIN } from "../author";
import {
  cdnUrlFromLink,
  cdnVideoDetails,
  createSnapsaveProvider,
  normalizeSnapsave,
  parseSnapsaveScript,
  SNAPSAVE_ENDPOINT,
  unpackSnapsave,
} from "./snapsave";

/** Respuestas reales de Snapsave tal como vinieron (noviembre de 2026; los links ya vencieron). */
const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/snapsave-${name}.txt`, import.meta.url), "utf8");

const REEL = fixture("reel");
const ALBUM = fixture("album");
const PHOTO = fixture("photo");
const ALERT = fixture("error");

const REEL_URL = "https://www.instagram.com/reel/Df8Tj7uNwUe/?igsh=abc";
const ALBUM_URL = "https://www.instagram.com/p/DgB12b7mt-f/";
const NIKE_PAGE = `<meta name="twitter:title" content="Nike (&#064;nike) &#x2022; Instagram reel" />`;

/** Arma un script con el mismo formato que el de Snapsave, para probar casos que no vinieron. */
function pack(code: string, offset = 7): string {
  const alphabet = "tnpymdofs";
  const base = 7;
  const separator = alphabet[base];
  const data = [...new TextEncoder().encode(code)]
    .map((byte) => [...(byte + offset).toString(base)].map((d) => alphabet[Number(d)]).join(""))
    .map((digits) => `${digits}${separator}`)
    .join("");
  return `eval(function(h,u,n,t,e,r){…}("${data}",61,"${alphabet}",${offset},${base},20))`;
}

const results = (html: string) =>
  pack(
    `document.getElementById("download-section").innerHTML = "${html.replace(/"/g, '\\"')}"; document.getElementById("inputData").remove(); `,
  );

const token = (payload: object) =>
  `https://d.rapidcdn.app/v2?token=e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.firma&dl=1`;

const item = (kind: "video" | "image", href: string, thumb = "") =>
  `<div class="download-items"><div class="download-items__thumb"><img src="${thumb}" alt="x"><span class="format-icon"><i class="icon icon-dl${kind}"></i></span></div><div class="download-items__btn"><a onclick="showAd();" href="${href}" class="button" title="Download Photo"><span>Download ${kind === "video" ? "video" : "Photo"}</span></a></div></div>`;

type Reply = Response | Error;

/** Responde según a quién se le pide: a Snapsave o a la página de Instagram. */
function setup(
  snapsave: Reply | (() => Reply),
  instagram: Reply = new Response("", { status: 404 }),
) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const reply = String(input).startsWith(INSTAGRAM_ORIGIN)
      ? instagram
      : typeof snapsave === "function"
        ? snapsave()
        : snapsave;
    if (reply instanceof Error) throw reply;
    return reply.clone();
  });
  const provider = createSnapsaveProvider({ fetch: fetchMock, probeSizes: false });
  const resolve = (url = REEL_URL, signal = new AbortController().signal) =>
    provider.resolve(url, { signal });
  return { fetchMock, provider, resolve };
}

const text = (body: string, status = 200) => new Response(body, { status });

describe("snapsave: desempaquetado", () => {
  it("desarma el script, con UTF-8 incluido", () => {
    expect(unpackSnapsave(pack('alert("¡Señal ✓!")'))).toBe('alert("¡Señal ✓!")');
    expect(unpackSnapsave(pack("hola", 0))).toBe("hola");
  });

  it("lee el aviso de error de una respuesta real", () => {
    expect(parseSnapsaveScript(ALERT)).toEqual({
      alert: "Error: Unable to connect to Instagram server",
    });
  });

  it("lee el HTML de resultados de una respuesta real, sin las barras de escape", () => {
    const outcome = parseSnapsaveScript(REEL);
    expect(outcome).toHaveProperty("html");
    if (!("html" in outcome)) return;
    expect(outcome.html).toContain('<div class="download-items">');
    expect(outcome.html).not.toContain('\\"');
  });

  it.each([
    ["HTML de Cloudflare", "<!DOCTYPE html><title>Just a moment...</title>"],
    ["un script que no escribe nada", pack("console.log(1)")],
    ["vacío", ""],
  ])("rechaza %s", (_label, body) => {
    expect(() => parseSnapsaveScript(body)).toThrowError(AppError);
  });
});

describe("snapsave: links", () => {
  it("saca el link del CDN del token de rapidcdn", () => {
    const cdn = "https://scontent-ams2-1.cdninstagram.com/o1/a.mp4?_nc_cat=1&oe=6B04ED5B";
    expect(cdnUrlFromLink(token({ url: cdn, filename: "a.mp4" }))).toBe(cdn);
    expect(cdnUrlFromLink(cdn.replace("&", "&amp;"))).toBe(cdn);
  });

  it.each([
    ["un token que apunta a otro sitio", token({ url: "https://evil.example/a.mp4" })],
    ["un token sin link", token({ filename: "a.mp4" })],
    ["un token que no es JSON", "https://d.rapidcdn.app/v2?token=a.bm8gZXMganNvbg.b"],
    ["el link roto que a veces manda", "&dl=1"],
    ["un link de rapidcdn sin token", "https://d.rapidcdn.app/v2?dl=1"],
    ["nada", undefined],
  ])("descarta %s", (_label, link) => {
    expect(cdnUrlFromLink(link)).toBeUndefined();
  });

  /** Etiquetas reales; la medida es la del MP4 que bajó el navegador. */
  it.each([
    ["vertical de 720x1280", "xpv_progressive.INSTAGRAM.CLIPS.C3.720.dash_baseline_1_v1", "hd"],
    [
      "horizontal de 1280x720",
      "xpv_progressive.INSTAGRAM.CLIPS.C3.1280.progressive_h264-basic-gen2_720p",
      "hd",
    ],
    ["horizontal sin sufijo", "xpv_progressive.INSTAGRAM.CLIPS.C3.1276.dash_baseline_1_v1", "hd"],
    ["vertical de 480x854", "xpv_progressive.INSTAGRAM.CLIPS.C3.480.dash_baseline_2_v1", "sd"],
    ["sin medida", "xpv_progressive.INSTAGRAM.CLIPS.dash_baseline_1_v1", undefined],
  ])("lee calidad y duración del parámetro efg: %s", (_label, tag, quality) => {
    const efg = Buffer.from(JSON.stringify({ vencode_tag: tag, duration_s: 15 })).toString(
      "base64",
    );
    const url = `https://scontent.cdninstagram.com/a.mp4?efg=${encodeURIComponent(efg)}`;
    expect(cdnVideoDetails(url)).toEqual({ quality, durationSeconds: 15 });
  });

  it("sin efg, o si no se puede leer, no inventa nada", () => {
    expect(cdnVideoDetails("https://scontent.cdninstagram.com/a.mp4")).toEqual({});
    expect(cdnVideoDetails("https://scontent.cdninstagram.com/a.mp4?efg=%%%")).toEqual({});
  });
});

describe("snapsave: normalización", () => {
  it("normaliza un reel real a un MediaResult válido, con portada, duración y calidad", async () => {
    const { resolve } = setup(text(REEL), text(NIKE_PAGE));
    const media = await resolve();

    expect(mediaResultSchema.parse(media)).toEqual(media);
    expect(media).toMatchObject({
      platform: "instagram",
      provider: "snapsave",
      id: "Df8Tj7uNwUe",
      sourceUrl: REEL_URL,
      author: { username: "nike", displayName: "Nike" },
      title: "",
      selectedIndex: undefined,
    });
    expect(media.items).toEqual([
      {
        id: "Df8Tj7uNwUe",
        coverUrl: expect.stringMatching(
          /^https:\/\/scontent-ber1-1\.cdninstagram\.com\/v\/t51\.82787-15\/911748336_/,
        ),
        durationSeconds: 15,
        variants: [
          {
            id: "hd",
            quality: "hd",
            watermark: false,
            url: expect.stringMatching(
              /^https:\/\/scontent-ber1-1\.cdninstagram\.com\/o1\/v\/t2\/f2\/m86\/AQPzGhOnMA0Yjk.+\.mp4\?/,
            ),
            mimeType: "video/mp4",
          },
        ],
      },
    ]);
  });

  it("devuelve los videos de un álbum real y saltea las fotos", async () => {
    const { resolve } = setup(text(ALBUM));
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
    const { resolve } = setup(text(ALBUM));
    const media = await resolve(`${ALBUM_URL}${query}`);
    expect(media.selectedIndex).toBe(selectedIndex);
  });

  it("lanza NO_VIDEO si el post solo tiene fotos", async () => {
    const { resolve } = setup(text(PHOTO));
    await expect(resolve("https://www.instagram.com/p/DfsD2gigngq/")).rejects.toMatchObject({
      code: "NO_VIDEO",
    });
  });

  it("ignora un video cuyo link no es del CDN y no corre la selección del álbum", () => {
    const ok = "https://scontent.cdninstagram.com/b.mp4";
    const media = normalizeSnapsave(
      [
        { isVideo: true, url: undefined },
        { isVideo: true, url: ok },
      ],
      { code: "ABCDE", path: "/p/ABCDE/", mediaNumber: 2 },
      "https://www.instagram.com/p/ABCDE/?img_index=2",
      undefined,
    );
    expect(media.items.map((i) => i.variants[0]?.url)).toEqual([ok]);
    expect(media.selectedIndex).toBe(0);
  });

  it("no manda a nadie fuera del CDN de Instagram", async () => {
    const hostile = results(item("video", token({ url: "https://evil.example/a.mp4" })));
    const { resolve } = setup(text(hostile));
    await expect(resolve()).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("entrega los links de fna.fbcdn.net ya apuntando a video.xx.fbcdn.net", async () => {
    const fna = "https://instagram.fcps2-1.fna.fbcdn.net/o1/v/a.mp4?_nc_cat=1";
    const { resolve } = setup(text(results(item("video", token({ url: fna })))));
    const media = await resolve();
    expect(media.items[0]?.variants[0]?.url).toBe(
      "https://video.xx.fbcdn.net/o1/v/a.mp4?_nc_cat=1",
    );
  });
});

describe("snapsave: autor", () => {
  it("si Instagram no muestra la página, usa el usuario del link", async () => {
    const { resolve } = setup(text(REEL), text("", 302));
    const media = await resolve("https://www.instagram.com/nike/reel/Df8Tj7uNwUe/");
    expect(media.author).toEqual({ username: "nike" });
  });

  it("si no hay de dónde sacarlo, queda como desconocido (aunque Instagram falle)", async () => {
    const { resolve } = setup(text(REEL), new TypeError("fetch failed"));
    const media = await resolve();
    expect(media.author).toEqual({ username: "desconocido" });
  });

  it("no le pide nada a Instagram si se desactiva", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => text(REEL));
    const provider = createSnapsaveProvider({
      fetch: fetchMock,
      probeSizes: false,
      lookupAuthor: false,
    });
    await provider.resolve(REEL_URL, { signal: new AbortController().signal });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("snapsave: pedidos y errores", () => {
  it("manda el link canónico como el formulario, sin hacerse pasar por un navegador", async () => {
    const { fetchMock, resolve } = setup(text(REEL));
    const signal = new AbortController().signal;
    await resolve("https://www.instagram.com/nike/reel/Df8Tj7uNwUe/?igsh=abc", signal);

    const call = fetchMock.mock.calls.find(([input]) => String(input) === SNAPSAVE_ENDPOINT);
    const init = call?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBe(signal);
    expect(String(init?.body)).toBe(
      new URLSearchParams({ url: "https://www.instagram.com/reel/Df8Tj7uNwUe/" }).toString(),
    );
    expect(init?.headers).toMatchObject({
      origin: "https://snapsave.app",
      referer: "https://snapsave.app/",
      "user-agent": USER_AGENT,
    });

    const page = fetchMock.mock.calls.find(([input]) => String(input).startsWith(INSTAGRAM_ORIGIN));
    expect(page?.[0]).toBe("https://www.instagram.com/reel/Df8Tj7uNwUe/");
  });

  it("tiene un timeout propio, más largo que el general", () => {
    const { provider } = setup(text(REEL));
    expect(provider.timeoutMs).toBeGreaterThanOrEqual(30_000);
  });

  it("completa el tamaño con un HEAD al CDN", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (init?.method === "HEAD") {
        return new Response(null, { headers: { "content-length": "1234567" } });
      }
      return String(input).startsWith(INSTAGRAM_ORIGIN) ? text("", 404) : text(REEL);
    });
    const provider = createSnapsaveProvider({ fetch: fetchMock });
    const media = await provider.resolve(REEL_URL, { signal: new AbortController().signal });
    expect(media.items[0]?.variants[0]?.size).toBe(1_234_567);
  });

  it.each([
    ["el aviso de error", () => text(ALERT), "NOT_FOUND"],
    ["HTTP 403 (desafío de Cloudflare)", () => text("Just a moment...", 403), "PROVIDER_ERROR"],
    ["HTTP 429", () => text("", 429), "RATE_LIMITED"],
    ["HTTP 500", () => text("", 500), "PROVIDER_ERROR"],
    ["200 con otra cosa", () => text("<html>mantenimiento</html>"), "PROVIDER_ERROR"],
    ["resultados sin medios", () => text(results("<section></section>")), "PROVIDER_ERROR"],
  ])("ante %s devuelve %s", async (_label, response, code) => {
    const { resolve } = setup(response);
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
    const { fetchMock, resolve } = setup(text(REEL));
    await expect(resolve("https://www.instagram.com/instagram/")).rejects.toMatchObject({
      code: "UNSUPPORTED_URL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
