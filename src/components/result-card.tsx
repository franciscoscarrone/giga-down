"use client";

import type { MediaResult } from "@/core/types";
import { formatBytes, formatDuration } from "@/lib/format";
import { registry } from "@/platforms";
import { Cover } from "./cover";
import { DownloadPanel } from "./download-panel";

interface ResultCardProps {
  media: MediaResult;
  onNotice(message: string): void;
  onRefresh(): void;
}

export function ResultCard({ media, onNotice, onRefresh }: ResultCardProps) {
  const platformName =
    registry.platforms.find((p) => p.id === media.platform)?.name ?? media.platform;
  const duration = formatDuration(media.durationSeconds);
  const clean = media.variants.filter((v) => !v.watermark);
  const sizes = clean.map((v) => formatBytes(v.size)).filter(Boolean);
  const title = media.title || "Video sin descripción";

  return (
    <article
      aria-labelledby="result-title"
      className="animate-rise overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card"
    >
      <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
        <Cover
          src={media.coverUrl}
          alt={`Portada del video de @${media.author.username}`}
          className="w-[5.75rem] sm:w-28"
        >
          {duration && (
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white">
              {duration}
            </span>
          )}
        </Cover>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-wider text-muted uppercase">
            <span
              className="size-1.5 rounded-full bg-accent ring-1 ring-fg/20"
              aria-hidden="true"
            />
            {platformName}
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

      <div className="border-t border-border p-4 sm:p-5">
        <DownloadPanel media={media} onNotice={onNotice} onRefresh={onRefresh} />
      </div>
    </article>
  );
}
