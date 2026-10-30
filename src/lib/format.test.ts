import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatRelativeTime } from "./format";

describe("formatBytes", () => {
  it.each([
    [undefined, undefined],
    [0, undefined],
    [512, "512 B"],
    [12_345, "12 KB"],
    [2_953_029, "3,0 MB"],
    [2_004_627, "2,0 MB"],
    [15_400_000, "15,4 MB"],
    [1_250_000_000, "1,3 GB"],
  ])("%j → %j", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it.each([
    [undefined, undefined],
    [-1, undefined],
    [0, "0:00"],
    [10, "0:10"],
    [75, "1:15"],
    [3_700, "1:01:40"],
  ])("%j → %j", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("formatRelativeTime", () => {
  const now = Date.UTC(2026, 9, 30, 12, 0, 0);

  it("dice 'recién' para menos de un minuto, aunque el reloj esté redondeado", () => {
    expect(formatRelativeTime(now - 20_000, now)).toBe("recién");
    expect(formatRelativeTime(now + 18_000, now)).toBe("recién");
  });

  it("usa minutos, horas y días", () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("hace 5 minutos");
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("hace 3 horas");
    expect(formatRelativeTime(now - 24 * 3_600_000, now)).toBe("ayer");
  });
});
