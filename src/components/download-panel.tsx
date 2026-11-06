"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { MediaItem, MediaResult, MediaVariant, Platform } from "@/core/types";
import { useDeviceOS, usePersistentStore } from "@/hooks/use-client-state";
import type { DeviceOS } from "@/lib/client/device";
import { canShareFile, DownloadError, downloadMedia, saveFile } from "@/lib/client/download";
import { qualityPreferenceStore } from "@/lib/client/preferences";
import { formatBytes } from "@/lib/format";
import { CheckIcon, DownloadIcon, ExternalIcon, RetryIcon, ShareIcon } from "./icons";
import { pickDefaultVariant, QUALITY_LABEL, QUALITY_NOTE, variantLabel } from "./quality";

type Phase =
  | { kind: "idle" }
  | { kind: "downloading"; progress: number | undefined }
  | { kind: "share"; file: File }
  | { kind: "done" }
  | { kind: "blocked"; variant: MediaVariant }
  | { kind: "expired" };

const HELP: Record<DeviceOS, string> = {
  ios: "En iPhone: tocá “Guardar en Fotos” y elegí Guardar video. Si se abre el reproductor, usá Compartir → Guardar video.",
  android:
    "En Android: queda en Descargas y aparece en la galería. Si se abre el reproductor, tocá ⋮ → Descargar.",
  desktop: "Se guarda en tu carpeta de Descargas.",
};

interface DownloadPanelProps {
  media: MediaResult;
  /** El video del post que se va a bajar. */
  item: MediaItem;
  platform: Platform | undefined;
  onNotice(message: string): void;
  onRefresh(): void;
}

/** Texto del botón: "sin marca de agua" solo tiene sentido en las redes que la ponen. */
function downloadLabel(media: MediaResult, item: MediaItem, platform: Platform | undefined) {
  if (platform?.watermarked ?? true) return "Descargar sin marca de agua";
  if (media.items.length > 1) return `Descargar video ${media.items.indexOf(item) + 1}`;
  return "Descargar video";
}

export function DownloadPanel({ media, item, platform, onNotice, onRefresh }: DownloadPanelProps) {
  const os = useDeviceOS();
  const preferences = usePersistentStore(qualityPreferenceStore);
  const target = preferences[media.platform] ?? platform?.defaultQuality ?? "sd";
  const clean = item.variants.filter((v) => !v.watermark);
  const watermarked = item.variants.find((v) => v.watermark);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const selected =
    clean.find((v) => v.id === chosenId) ?? pickDefaultVariant(item.variants, target);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const helpId = useId();

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!selected) return null;
  const busy = phase.kind === "downloading";

  async function start(variant: MediaVariant) {
    if (busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "downloading", progress: 0 });

    try {
      const outcome = await downloadMedia(media, item, variant.id, {
        signal: controller.signal,
        onProgress: (progress) => setPhase({ kind: "downloading", progress }),
      });

      if (outcome.kind === "blocked") {
        const opened = window.open(outcome.variant.url, "_blank");
        if (opened) opened.opener = null;
        setPhase({ kind: "blocked", variant: outcome.variant });
        return;
      }

      if (outcome.fellBack) {
        onNotice(
          `No se pudo bajar en ${variantLabel(variant)}. Se descargó en ${variantLabel(outcome.variant)}.`,
        );
      }
      if (os === "ios" && canShareFile(outcome.file)) {
        // Compartir necesita un toque nuevo del usuario: la descarga ya consumió el anterior.
        setPhase({ kind: "share", file: outcome.file });
      } else {
        saveFile(outcome.file);
        setPhase({ kind: "done" });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase(error instanceof DownloadError ? { kind: "expired" } : { kind: "blocked", variant });
    }
  }

  async function share(file: File) {
    try {
      await navigator.share({ files: [file], title: media.title || "Video" });
      setPhase({ kind: "done" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      saveFile(file);
      setPhase({ kind: "done" });
    }
  }

  function choose(variant: MediaVariant) {
    setChosenId(variant.id);
    qualityPreferenceStore.set({
      ...qualityPreferenceStore.getSnapshot(),
      [media.platform]: variant.quality,
    });
    if (phase.kind !== "downloading") setPhase({ kind: "idle" });
  }

  const progress = phase.kind === "downloading" ? phase.progress : undefined;
  const percent = progress === undefined ? undefined : Math.round(progress * 100);
  // Con cuatro calidades (pasa en X) queda mejor una grilla de 2×2 que una fila de 3 y 1.
  const columns = clean.length === 4 ? 2 : Math.min(clean.length, 3);

  return (
    <div className="flex flex-col gap-4">
      {clean.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Calidad</legend>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {clean.map((variant) => {
              const active = variant.id === selected.id;
              return (
                <label
                  key={variant.id}
                  className={`relative flex min-h-14 cursor-pointer flex-col justify-center rounded-[var(--radius-control)] border px-3.5 py-2 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
                    active
                      ? "border-fg bg-accent-soft"
                      : "border-border-strong bg-surface hover:border-fg/60"
                  }`}
                >
                  <input
                    type="radio"
                    name={`quality-${media.id}-${item.id}`}
                    value={variant.id}
                    checked={active}
                    onChange={() => choose(variant)}
                    className="sr-only"
                  />
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                    {QUALITY_LABEL[variant.quality]}
                    {active && <CheckIcon className="size-4" />}
                  </span>
                  <span className="font-mono text-xs text-muted">
                    {formatBytes(variant.size) ?? QUALITY_NOTE[variant.quality]}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {phase.kind === "share" ? (
        <button
          type="button"
          onClick={() => share(phase.file)}
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-6 text-base font-semibold text-primary-fg transition hover:bg-primary-hover active:scale-[0.985]"
        >
          <ShareIcon className="size-5" />
          Guardar en Fotos
        </button>
      ) : (
        <button
          type="button"
          onClick={() => start(selected)}
          disabled={busy}
          aria-describedby={helpId}
          className="relative isolate inline-flex min-h-14 items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-control)] bg-primary px-6 text-base font-semibold text-primary-fg transition hover:bg-primary-hover active:scale-[0.985] disabled:cursor-progress"
        >
          {busy && (
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 left-0 -z-10 bg-fg/15 transition-[width] duration-200 dark:bg-bg/20 ${
                percent === undefined ? "w-full animate-shimmer" : ""
              }`}
              style={percent === undefined ? undefined : { width: `${percent}%` }}
            />
          )}
          {busy ? (
            <>Descargando{percent === undefined ? "…" : ` ${percent}%`}</>
          ) : phase.kind === "done" ? (
            <>
              <CheckIcon className="size-5" />
              Descargado · bajar de nuevo
            </>
          ) : (
            <>
              <DownloadIcon className="size-5" />
              {downloadLabel(media, item, platform)}
            </>
          )}
        </button>
      )}

      {phase.kind === "blocked" && (
        <div className="rounded-[var(--radius-control)] border border-border-strong bg-surface-2 p-3.5 text-sm">
          <p className="font-medium">El navegador no dejó bajarlo directo.</p>
          <p className="mt-1 text-muted">
            Lo abrimos en otra pestaña. Si no se abrió, tocá el botón y guardalo desde el
            reproductor.
          </p>
          <a
            href={phase.variant.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[0.625rem] bg-surface px-3.5 font-medium shadow-card"
          >
            <ExternalIcon className="size-4" />
            Abrir video en otra pestaña
          </a>
        </div>
      )}

      {phase.kind === "expired" && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-danger/40 bg-danger-soft p-3.5 text-sm"
        >
          <p className="font-medium">Los links de descarga vencieron.</p>
          <p className="mt-1 text-muted">
            Pasa cuando el resultado tiene un rato. Buscalo de nuevo.
          </p>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[0.625rem] bg-surface px-3.5 font-medium shadow-card"
          >
            <RetryIcon className="size-4" />
            Buscar de nuevo
          </button>
        </div>
      )}

      <p id={helpId} className="text-sm text-muted">
        {os ? HELP[os] : HELP.desktop}
      </p>

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-sm">
        <a
          href={selected.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 font-medium text-muted underline-offset-4 transition hover:text-fg hover:underline"
        >
          <ExternalIcon className="size-4" />
          Abrir en otra pestaña
        </a>
        {watermarked && (
          <button
            type="button"
            onClick={() => start(watermarked)}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-muted underline-offset-4 transition hover:text-fg hover:underline disabled:opacity-60"
          >
            <DownloadIcon className="size-4" />
            Con marca de agua
            {watermarked.size ? (
              <span className="font-mono text-xs">· {formatBytes(watermarked.size)}</span>
            ) : null}
          </button>
        )}
      </div>
    </div>
  );
}
