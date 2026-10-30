import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/errors";
import { mediaResultSchema } from "@/core/types";
import fixture from "./__fixtures__/syndication-video.json";
import {
  cleanTweetText,
  createSyndicationProvider,
  SYNDICATION_ENDPOINT,
  syndicationToken,
} from "./syndication";

const SOURCE = "https://x.com/historyinmemes/status/1790637656616943991";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Respuesta real del endpoint de embeds (ver __fixtures__), recortada a los campos que usamos. */
const tweet = () => structuredClone(fixture);

function setup(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  const provider = createSyndicationProvider({ fetch: fetchMock, probeSizes: false });
  const resolve = (url = SOURCE, signal = new AbortController().signal) =>
    provider.resolve(url, { signal });
  return { fetchMock, resolve };
}

describe("syndication: normalización", () => {
  it("normaliza la respuesta real a un MediaResult válido", async () => {
    const { resolve } = setup(json(tweet()));
    const media = await resolve();

    expect(mediaResultSchema.parse(media)).toEqual(media);
    expect(media).toMatchObject({
      platform: "x",
      provider: "syndication",
      id: "1790637656616943991",
      author: { username: "historyinmemes", displayName: "Historic Vids" },
      title: "One of the most intense moments in history",
    });
    expect(media.items).toEqual([
      {
        id: "1790637656616943991-1",
        label: undefined,
        coverUrl: fixture.mediaDetails[0]?.media_url_https,
        durationSeconds: 15.488,
        width: 886,
        height: 876,
        variants: [
          expect.objectContaining({ quality: "low", url: expect.stringContaining("272x270") }),
          expect.objectContaining({ quality: "sd", url: expect.stringContaining("364x360") }),
          expect.objectContaining({ quality: "hd", url: expect.stringContaining("728x720") }),
        ],
      },
    ]);
  });

  it("suma los videos del tweet citado y marca los GIF", async () => {
    const quoted = { ...tweet(), id_str: "1", user: { screen_name: "otro", name: "Otro" } };
    const body = {
      ...tweet(),
      mediaDetails: [
        {
          type: "animated_gif",
          media_url_https: "https://pbs.twimg.com/tweet_video_thumb/abc.jpg",
          original_info: { width: 540, height: 400 },
          video_info: {
            variants: [
              {
                bitrate: 0,
                content_type: "video/mp4",
                url: "https://video.twimg.com/tweet_video/abc.mp4",
              },
            ],
          },
        },
      ],
      quoted_tweet: quoted,
    };
    const { resolve } = setup(json(body));

    const media = await resolve();

    expect(media.items.map((i) => i.label)).toEqual(["GIF", "Cita de @otro"]);
  });

  it("selecciona el video que pide /video/N contando las fotos", async () => {
    const body = tweet();
    const photo = { type: "photo", media_url_https: "https://pbs.twimg.com/media/foto.jpg" };
    const { resolve } = setup(json({ ...body, mediaDetails: [photo, ...body.mediaDetails] }));

    const media = await resolve(`${SOURCE}/video/2`);

    expect(media.items).toHaveLength(1);
    expect(media.selectedIndex).toBe(0);
  });

  it("lanza NO_VIDEO si el tweet no tiene videos", async () => {
    const { resolve } = setup(json({ ...tweet(), mediaDetails: undefined }));
    await expect(resolve()).rejects.toMatchObject({ code: "NO_VIDEO" });
  });
});

describe("cleanTweetText", () => {
  it.each([
    [
      "One of the most intense moments in history https://t.co/Zgzhvix8ES",
      "One of the most intense moments in history",
    ],
    ["Dos https://t.co/aaa https://t.co/bbb", "Dos"],
    ["Tom &amp; Jerry &lt;3", "Tom & Jerry <3"],
    ["Link en el medio https://t.co/aaa y texto", "Link en el medio https://t.co/aaa y texto"],
    [undefined, ""],
  ])("%j → %j", (input, expected) => {
    expect(cleanTweetText(input)).toBe(expected);
  });
});

describe("syndication: pedidos y errores", () => {
  it("calcula el token igual que el script de embeds de X", () => {
    expect(syndicationToken("1790637656616943991")).toMatch(/^[a-z1-9]+$/);
    expect(syndicationToken("20")).toBe(
      ((20 / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ""),
    );
  });

  it("pide el tweet con su id, el token y la señal del registry", async () => {
    const { fetchMock, resolve } = setup(json(tweet()));
    const signal = new AbortController().signal;

    await resolve(SOURCE, signal);

    const [endpoint, init] = fetchMock.mock.calls[0]!;
    const url = new URL(String(endpoint));
    expect(url.origin + url.pathname).toBe(SYNDICATION_ENDPOINT);
    expect(url.searchParams.get("id")).toBe("1790637656616943991");
    expect(url.searchParams.get("token")).toBe(syndicationToken("1790637656616943991"));
    expect(init?.signal).toBe(signal);
  });

  it.each([
    ["HTTP 404 (no existe)", () => new Response("<html>404</html>", { status: 404 }), "NOT_FOUND"],
    ["TweetTombstone", () => json({ __typename: "TweetTombstone", tombstone: {} }), "NOT_FOUND"],
    ["HTTP 429", () => new Response("", { status: 429 }), "RATE_LIMITED"],
    ["HTTP 500", () => new Response("", { status: 500 }), "PROVIDER_ERROR"],
    ["200 que no es JSON", () => new Response("<html>caído</html>"), "PROVIDER_ERROR"],
    ["JSON con otra forma", () => json({ hola: "mundo" }), "PROVIDER_ERROR"],
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
