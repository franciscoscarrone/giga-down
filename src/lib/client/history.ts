import { z } from "zod";
import { selectedItem, type MediaResult } from "@/core/types";
import { createPersistentStore } from "./persistent-store";

export const HISTORY_KEY = "gigadown:history:v1";
export const HISTORY_LIMIT = 20;

/**
 * Guardamos solo metadatos: los links de video del CDN vencen en horas, así que al tocar
 * un elemento del historial se vuelve a resolver el link original.
 */
const historyEntrySchema = z.object({
  platform: z.string(),
  id: z.string(),
  sourceUrl: z.string(),
  author: z.string(),
  title: z.string(),
  coverUrl: z.string().optional(),
  durationSeconds: z.number().optional(),
  savedAt: z.number(),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

/** Lee lo guardado descartando entradas corruptas en vez de perder todo el historial. */
export function decodeHistory(raw: string): HistoryEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => historyEntrySchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data)
    .slice(0, HISTORY_LIMIT);
}

export function addToHistory(
  entries: readonly HistoryEntry[],
  media: MediaResult,
  now: number = Date.now(),
): HistoryEntry[] {
  const item = selectedItem(media);
  const entry: HistoryEntry = {
    platform: media.platform,
    id: media.id,
    sourceUrl: media.sourceUrl,
    author: media.author.username,
    title: media.title,
    coverUrl: item.coverUrl,
    durationSeconds: item.durationSeconds,
    savedAt: now,
  };
  const rest = entries.filter((e) => !(e.platform === entry.platform && e.id === entry.id));
  return [entry, ...rest].slice(0, HISTORY_LIMIT);
}

const EMPTY: HistoryEntry[] = [];

export const historyStore = createPersistentStore<HistoryEntry[]>({
  key: HISTORY_KEY,
  fallback: EMPTY,
  decode: decodeHistory,
  encode: (entries) => (entries.length ? JSON.stringify(entries) : null),
});
