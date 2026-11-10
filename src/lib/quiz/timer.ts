const MINUTE_MS = 60_000;

/** Seconds-remaining thresholds announced to assistive tech: 5 minutes, 1 minute and time up. */
export const ANNOUNCE_MARKS_MS = [5 * MINUTE_MS, MINUTE_MS, 0] as const;

/** The moment the test ends, or null when the timer is off (0 minutes). Absolute, so a slow tick never drifts. */
export function deadlineFor(startedAt: number, timerMinutes: number): number | null {
  return timerMinutes <= 0 ? null : startedAt + timerMinutes * MINUTE_MS;
}

/** Milliseconds left, never below zero. */
export function remainingMs(deadline: number, now: number): number {
  return Math.max(0, deadline - now);
}

export function isExpired(deadline: number | null, now: number): boolean {
  return deadline !== null && now >= deadline;
}

/** Time spent on the test: up to the submit, but never past the deadline. */
export function timeUsedMs(startedAt: number, endedAt: number, deadline: number | null): number {
  const end = deadline === null ? endedAt : Math.min(endedAt, deadline);

  return Math.max(0, end - startedAt);
}

/** `m:ss`, or `h:mm:ss` from one hour, counting partial seconds up so 0:00 only shows at expiry. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** The announce marks crossed going from `previousMs` to `currentMs` left (the lowest one reached wins). */
export function crossedMark(previousMs: number, currentMs: number): (typeof ANNOUNCE_MARKS_MS)[number] | null {
  const crossed = ANNOUNCE_MARKS_MS.filter((mark) => previousMs > mark && currentMs <= mark);

  return crossed.length > 0 ? crossed[crossed.length - 1] : null;
}
