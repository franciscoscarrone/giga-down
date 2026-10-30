"use client";

import { useState } from "react";
import type { MediaItem, MediaResult } from "@/core/types";
import { formatBytes, formatDuration } from "@/lib/format";
import { platformById } from "@/platforms";
import { Cover, PORTRAIT } from "./cover";
import { DownloadPanel } from "./download-panel";
import { hasPlatformIcon, PlatformIcon } from "./platform-icon";

interface ResultCardProps {
  media: MediaResult;
  onNotice(message: string): void;
  onRefresh(): void;
}

const aspectOf = (item: MediaItem) =>
  item.width && item.height ? item.width / item.height : PORTRAIT;

/** Ancho de la portada según la forma del video: los horizontales necesitan más lugar. */
function coverWidth(aspect: number): string {
  if (aspect < 0.8) return "w-[5.75rem] sm:w-28";
  if (aspect <= 1.25) return "w-28 sm:w-32";
  return "w-32 sm:w-44";
}

export function ResultCard({ media, onNotice, onRefresh }: ResultCardProps) {
  const platform = platformById(media.platform);
  const [index, setIndex] = useState(() =>
    media.selectedIndex !== undefined && media.selectedIndex < media.items.length
      ? media.selectedIndex
      : 0,
  );
  const item = media.items[index] ?? media.items[0]!;
  const aspect = aspectOf(item);
  const duration = formatDuration(item.durationSeconds);
  const clean = item.variants.filter((v) => !v.watermark);
  const sizes = clean.map((v) => formatBytes(v.size)).filter(Boolean);
  const title = media.title || "Video sin descripción";

  return (
    <article
      aria-labelledby="result-title"
      className="animate-rise overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card"
    >
      <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
        <Cover
          src={item.coverUrl}
          alt={`Portada del video de @${media.author.username}`}
          aspectRatio={aspect}
          className={coverWidth(aspect)}
        >
          {duration && (
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white">
              {duration}
            </span>
          )}
        </Cover>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-wider text-muted uppercase">
            {hasPlatformIcon(media.platform) ? (
              <PlatformIcon platform={media.platform} className="size-3 text-fg" />
            ) : (
              <span
                className="size-1.5 rounded-full bg-accent ring-1 ring-fg/20"
                aria-hidden="true"
              />
            )}
            {platform?.name ?? media.platform}
          </p>
          <h2 id="result-title" className="line-clamp-3 leading-snug font-semibold break-words">
            {title}
          </h2>
          <p className="truncate text-sm text-muted">
            <span className="font-medium text-fg">@{media.author.username}</span>
            {media.author.displayName && media.author.displayName !== media.author.username
              ? ` · ${media.author.displayName}`
              : null}
          </p>
          <dl className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 font-mono text-xs text-muted">
            {duration && (
              <div className="flex gap-1">
                <dt>Duración</dt>
                <dd className="text-fg">{duration}</dd>
              </div>
            )}
            {sizes.length > 0 && (
              <div className="flex gap-1">
                <dt>Tamaño</dt>
                <dd className="text-fg">{sizes.join(" / ")}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {media.items.length > 1 && (
        <div className="border-t border-border p-4 sm:p-5">
          <ItemPicker media={media} selected={index} onSelect={setIndex} />
        </div>
      )}

      <div className="border-t border-border p-4 sm:p-5">
        <DownloadPanel
          // Cada video tiene sus calidades y su propio estado de descarga.
          key={item.id}
          media={media}
          item={item}
          platform={platform}
          onNotice={onNotice}
          onRefresh={onRefresh}
        />
      </div>
    </article>
  );
}

interface ItemPickerProps {
  media: MediaResult;
  selected: number;
  onSelect(index: number): void;
}

/** Selector de video para los posts que traen varios (X permite hasta cuatro). */
function ItemPicker({ media, selected, onSelect }: ItemPickerProps) {
  const columns = Math.min(media.items.length, 4);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">
        Este post tiene {media.items.length} videos. ¿Cuál bajás?
      </legend>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {media.items.map((item, index) => {
          const active = index === selected;
          const duration = formatDuration(item.durationSeconds);
          return (
            <label
              key={item.id}
              className="group flex min-w-0 cursor-pointer flex-col gap-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name={`item-${media.platform}-${media.id}`}
                value={item.id}
                checked={active}
                onChange={() => onSelect(index)}
                className="sr-only"
              />
              <Cover
                src={item.coverUrl}
                alt=""
                aspectRatio={1}
                className={`w-full rounded-xl ring-2 transition ${
                  active ? "ring-fg" : "ring-transparent group-hover:ring-fg/40"
                }`}
              >
                {duration && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 font-mono text-[10px] font-medium text-white">
                    {duration}
                  </span>
                )}
              </Cover>
              <span className="flex flex-col text-xs leading-tight">
                <span className={active ? "font-semibold" : "font-medium text-muted"}>
                  Video {index + 1}
                </span>
                {item.label && <span className="truncate text-muted">{item.label}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
