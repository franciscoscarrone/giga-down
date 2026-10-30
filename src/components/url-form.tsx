"use client";

import { useId, useState, type FormEvent } from "react";
import { registry } from "@/platforms";
import { ArrowRightIcon, ClipboardIcon } from "./icons";

interface UrlFormProps {
  value: string;
  onChange(value: string): void;
  onSubmit(value: string): void;
  busy: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}

const SUPPORTED = registry.platforms.map((p) => p.name).join(", ");

export function UrlForm({ value, onChange, onSubmit, busy, inputRef }: UrlFormProps) {
  const errorId = useId();
  const hintId = useId();
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  function submit(raw: string) {
    if (busy) return;
    if (!raw.trim()) {
      setFieldError("Pegá un link para empezar.");
      return;
    }
    if (!registry.match(raw)) {
      setFieldError(`Eso no parece un link de video de ${SUPPORTED}.`);
      return;
    }
    setFieldError(null);
    onSubmit(raw);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit(value);
  }

  async function handlePaste() {
    setPasteNote(null);
    try {
      if (!navigator.clipboard?.readText) throw new Error("unsupported");
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setPasteNote("El portapapeles está vacío. Copiá el link del video primero.");
        return;
      }
      onChange(text);
      // Si lo pegado es un link válido, ahorramos un toque y buscamos directo.
      if (registry.match(text)) submit(text);
      else setFieldError(`Eso no parece un link de video de ${SUPPORTED}.`);
    } catch {
      setPasteNote(
        "Tu navegador no deja leer el portapapeles. Mantené apretado el campo y elegí Pegar.",
      );
    }
  }

  const describedBy = [fieldError ? errorId : null, hintId].filter(Boolean).join(" ");

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <label htmlFor="media-url" className="text-sm font-medium">
        Link del video
      </label>
      <div
        className={`flex items-stretch gap-1.5 rounded-[var(--radius-control)] border bg-surface p-1.5 shadow-card transition-colors focus-within:border-fg ${
          fieldError ? "border-danger" : "border-border-strong"
        }`}
      >
        <input
          ref={inputRef}
          id="media-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="https://vm.tiktok.com/…"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            if (fieldError) setFieldError(null);
          }}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={describedBy}
          className="min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted/70 focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={handlePaste}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[0.625rem] bg-surface-2 px-3.5 text-sm font-medium transition hover:bg-border active:scale-[0.97]"
        >
          <ClipboardIcon className="size-[18px]" />
          Pegar
        </button>
      </div>

      {fieldError && (
        <p id={errorId} role="alert" className="text-sm font-medium text-danger">
          {fieldError}
        </p>
      )}
      {pasteNote && (
        <p role="status" className="text-sm text-muted">
          {pasteNote}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="group inline-flex min-h-14 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-6 text-base font-semibold text-primary-fg transition hover:bg-primary-hover active:scale-[0.985] disabled:cursor-progress disabled:opacity-70"
      >
        {busy ? "Buscando…" : "Buscar video"}
        <ArrowRightIcon className="size-5 transition-transform group-hover:translate-x-0.5" />
      </button>
      <p id={hintId} className="text-sm text-muted">
        En la app tocá <span className="font-medium text-fg">Compartir → Copiar enlace</span> y
        pegalo acá. Funciona con {SUPPORTED}.
      </p>
    </form>
  );
}
