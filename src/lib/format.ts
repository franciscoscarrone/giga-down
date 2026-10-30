const LOCALE = "es-AR";

/** "2,9 MB". Usa unidades decimales, como iOS y Android. */
export function formatBytes(bytes: number | undefined): string | undefined {
  if (!bytes || bytes <= 0) return undefined;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = unit >= 2 ? 1 : 0;
  const number = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${number} ${units[unit]}`;
}

/** "0:10", "1:15", "1:01:40". */
export function formatDuration(seconds: number | undefined): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return undefined;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

/** "recién", "hace 5 minutos", "ayer". */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  let value = (timestamp - now) / 1000;
  // `now` puede venir redondeado al minuto: lo de menos de un minuto (o "futuro") es "recién".
  if (value > -60) return "recién";
  const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) return formatter.format(Math.round(value), unit);
    value /= size;
  }
  return formatter.format(Math.round(value), "year");
}
