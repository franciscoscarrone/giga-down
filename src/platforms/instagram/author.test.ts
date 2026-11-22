import { describe, expect, it, vi } from "vitest";
import { USER_AGENT } from "@/platforms/media";
import { fetchPostAuthor, parseAuthorMeta } from "./author";

/** Las etiquetas tal como vienen en la página pública de un reel (el resto, recortado). */
const PAGE = `<meta property="og:type" content="article" />
<meta name="twitter:title" content="Nike (&#064;nike) &#x2022; Instagram reel" />
<meta property="og:url" content="https://www.instagram.com/nike/reel/Df8Tj7uNwUe/" />`;

describe("parseAuthorMeta", () => {
  it("lee nombre y usuario del título", () => {
    expect(parseAuthorMeta(PAGE)).toEqual({ username: "nike", displayName: "Nike" });
  });

  it("si el título cambia de forma, usa el usuario de og:url", () => {
    const page = PAGE.replace("Nike (&#064;nike) &#x2022; Instagram reel", "Instagram");
    expect(parseAuthorMeta(page)).toEqual({ username: "nike" });
  });

  it("no inventa nada si no hay etiquetas (por ejemplo, la página de login)", () => {
    expect(parseAuthorMeta("<html><title>Login • Instagram</title></html>")).toBeUndefined();
    const og = `<meta property="og:url" content="https://www.instagram.com/accounts/login/" />`;
    expect(parseAuthorMeta(og)).toBeUndefined();
  });
});

describe("fetchPostAuthor", () => {
  it("pide la página pública, identificándose como lo que es", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(PAGE));
    const author = await fetchPostAuthor(
      "/reel/Df8Tj7uNwUe/",
      fetchMock,
      new AbortController().signal,
    );

    expect(author).toEqual({ username: "nike", displayName: "Nike" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.instagram.com/reel/Df8Tj7uNwUe/",
      expect.objectContaining({ headers: expect.objectContaining({ "user-agent": USER_AGENT }) }),
    );
  });

  it.each([
    ["Instagram responde un error", async () => new Response("", { status: 429 })],
    [
      "falla la red",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("devuelve undefined si %s", async (_label, impl) => {
    const author = await fetchPostAuthor("/p/ABCDE/", vi.fn(impl), new AbortController().signal);
    expect(author).toBeUndefined();
  });
});
