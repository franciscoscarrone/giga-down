"use client";

import { useState } from "react";
import { PlayIcon } from "./icons";

interface CoverProps {
  src: string | undefined;
  alt: string;
  /** Ancho / alto. Por defecto 9:16 (TikTok); se limita entre 9:16 y 16:9. */
  aspectRatio?: number;
  className?: string;
  children?: React.ReactNode;
}

export const PORTRAIT = 9 / 16;
const LANDSCAPE = 16 / 9;

/**
 * Portada con la proporción del video. Usa <img> y no next/image: son URLs firmadas del CDN
 * que vencen en horas, y optimizarlas en Vercel gastaría cuota sin beneficio.
 */
export function Cover({ src, alt, aspectRatio = PORTRAIT, className = "", children }: CoverProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src && failedSrc !== src;
  const ratio = Math.min(Math.max(aspectRatio, PORTRAIT), LANDSCAPE);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl bg-surface-2 ${className}`}
      style={{ aspectRatio: ratio }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- ver comentario del componente
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          decoding="async"
          onError={() => setFailedSrc(src)}
          className="size-full object-cover"
        />
      ) : (
        <div
          className="flex size-full items-center justify-center text-muted"
          role="img"
          aria-label={alt}
        >
          <PlayIcon className="size-6 opacity-60" />
        </div>
      )}
      {children}
    </div>
  );
}
