"use client";

import { useState } from "react";
import { PlayIcon } from "./icons";

interface CoverProps {
  src: string | undefined;
  alt: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Portada 9:16. Usa <img> y no next/image: son URLs firmadas del CDN que vencen en horas,
 * y optimizarlas en Vercel gastaría cuota sin beneficio.
 */
export function Cover({ src, alt, className = "", children }: CoverProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src && failedSrc !== src;

  return (
    <div
      className={`relative aspect-[9/16] shrink-0 overflow-hidden rounded-xl bg-surface-2 ${className}`}
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
