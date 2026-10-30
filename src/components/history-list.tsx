"use client";

import { useState } from "react";
import type { HistoryEntry } from "@/lib/client/history";
import { formatDuration, formatRelativeTime } from "@/lib/format";
import { Cover } from "./cover";
import { TrashIcon } from "./icons";

interface HistoryListProps {
  entries: readonly HistoryEntry[];
  now: number;
  onSelect(entry: HistoryEntry): void;
  onClear(): void;
  disabled?: boolean;
}

export function HistoryList({ entries, now, onSelect, onClear, disabled }: HistoryListProps) {
  const [confirming, setConfirming] = useState(false);
  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-3">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 id="history-title" className="font-display text-lg font-semibold tracking-tight">
          Recientes
          <span className="ml-2 font-mono text-xs font-normal text-muted">{entries.length}</span>
        </h2>
        {confirming ? (
          <div className="flex items-center gap-1 text-sm">
            <span className="mr-1 text-muted">¿Borrar todo?</span>
            <button
              type="button"
              onClick={() => {
                onClear();
                setConfirming(false);
              }}
              className="min-h-11 rounded-[0.625rem] px-3 font-semibold text-danger transition hover:bg-danger-soft"
            >
              Sí, borrar
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-11 rounded-[0.625rem] px-3 font-medium transition hover:bg-surface-2"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[0.625rem] px-3 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <TrashIcon className="size-4" />
            Borrar historial
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li key={`${entry.platform}:${entry.id}`}>
            <button
              type="button"
              onClick={() => onSelect(entry)}
              disabled={disabled}
              className="flex w-full items-center gap-3 rounded-[var(--radius-control)] p-2 text-left transition hover:bg-surface active:scale-[0.99] disabled:opacity-60"
            >
              <Cover src={entry.coverUrl} alt="" className="w-10 rounded-lg" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {entry.title || "Video sin descripción"}
                </span>
                <span className="truncate font-mono text-xs text-muted">
                  @{entry.author}
                  {entry.durationSeconds
                    ? ` · ${formatDuration(entry.durationSeconds)}`
                    : ""} · {formatRelativeTime(entry.savedAt, now)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
