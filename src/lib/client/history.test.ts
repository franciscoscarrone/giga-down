import { describe, expect, it } from "vitest";
import type { MediaResult } from "@/core/types";
import { addToHistory, decodeHistory, HISTORY_LIMIT, type HistoryEntry } from "./history";
import { createSafeStorage } from "./storage";

const media = (id: string): MediaResult => ({
  platform: "tiktok",
  provider: "tikwm",
  id,
  sourceUrl: `https://www.tiktok.com/@a/video/${id}`,
  author: { username: "a" },
  title: `Video ${id}`,
  variants: [
    {
      id: "sd",
      quality: "sd",
      watermark: false,
      url: "https://cdn.example/a.mp4",
      mimeType: "video/mp4",
    },
  ],
});

describe("addToHistory", () => {
  it("agrega al principio solo metadatos (sin links de video, que vencen)", () => {
    const [entry] = addToHistory([], media("1"), 1_000);
    expect(entry).toEqual({
      platform: "tiktok",
      id: "1",
      sourceUrl: "https://www.tiktok.com/@a/video/1",
      author: "a",
      title: "Video 1",
      coverUrl: undefined,
      durationSeconds: undefined,
      savedAt: 1_000,
    });
  });

  it("no duplica: el video repetido sube al principio", () => {
    let entries: HistoryEntry[] = [];
    for (const id of ["1", "2", "3"]) entries = addToHistory(entries, media(id));
    entries = addToHistory(entries, media("1"));
    expect(entries.map((e) => e.id)).toEqual(["1", "3", "2"]);
  });

  it(`guarda como máximo ${HISTORY_LIMIT} elementos`, () => {
    let entries: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) entries = addToHistory(entries, media(String(i)));
    expect(entries).toHaveLength(HISTORY_LIMIT);
    expect(entries[0]?.id).toBe(String(HISTORY_LIMIT + 4));
  });
});

describe("decodeHistory", () => {
  it("tolera JSON roto o con otra forma", () => {
    expect(decodeHistory("{no es json")).toEqual([]);
    expect(decodeHistory('{"a":1}')).toEqual([]);
  });

  it("descarta solo las entradas inválidas", () => {
    const valid = addToHistory([], media("1"))[0];
    expect(decodeHistory(JSON.stringify([valid, { id: 2 }, null]))).toEqual([valid]);
  });
});

describe("createSafeStorage", () => {
  it("sigue funcionando en memoria si localStorage tira error", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;
    const storage = createSafeStorage(() => broken);

    storage.set("k", "v");
    expect(storage.get("k")).toBe("v");
    storage.remove("k");
    expect(storage.get("k")).toBeNull();
  });

  it("funciona sin localStorage (servidor)", () => {
    const storage = createSafeStorage(() => undefined);
    expect(storage.get("k")).toBeNull();
    storage.set("k", "v");
    expect(storage.get("k")).toBe("v");
  });
});
