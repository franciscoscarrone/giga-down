/** Marca de GigaDown: flecha hacia abajo sobre una bandeja, en un cuadrado lima. */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <path
        d="M32 15v24m-11-11 11 11 11-11M19 48h26"
        fill="none"
        stroke="var(--accent-fg)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-xl font-extrabold tracking-tight">
        Giga<span className="text-muted">Down</span>
      </span>
    </span>
  );
}
