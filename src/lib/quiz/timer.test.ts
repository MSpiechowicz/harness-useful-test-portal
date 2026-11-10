import { describe, expect, test } from 'bun:test';
import { crossedMark, deadlineFor, formatClock, isExpired, remainingMs, timeUsedMs } from './timer';

describe('deadline math', () => {
  test('the deadline is absolute and 0 minutes means no timer', () => {
    expect(deadlineFor(1000, 30)).toBe(1000 + 30 * 60_000);
    expect(deadlineFor(1000, 0)).toBeNull();
  });

  test('remaining time follows the clock and never goes negative', () => {
    expect(remainingMs(10_000, 4_000)).toBe(6_000);
    expect(remainingMs(10_000, 12_000)).toBe(0);
  });

  test('expiry is at the deadline, never without one', () => {
    expect(isExpired(10_000, 9_999)).toBe(false);
    expect(isExpired(10_000, 10_000)).toBe(true);
    expect(isExpired(null, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  test('time used is capped at the deadline when submit comes late', () => {
    expect(timeUsedMs(0, 50_000, 120_000)).toBe(50_000);
    expect(timeUsedMs(0, 130_000, 120_000)).toBe(120_000);
    expect(timeUsedMs(0, 130_000, null)).toBe(130_000);
  });
});

describe('formatClock', () => {
  test('formats minutes and seconds, rounding partial seconds up', () => {
    expect(formatClock(30 * 60_000)).toBe('30:00');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(500)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });

  test('adds hours from one hour', () => {
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(180 * 60_000)).toBe('3:00:00');
  });
});

describe('crossedMark', () => {
  test('announces 5 minutes, 1 minute and expiry once each', () => {
    expect(crossedMark(5 * 60_000 + 500, 5 * 60_000 - 500)).toBe(5 * 60_000);
    expect(crossedMark(60_500, 59_500)).toBe(60_000);
    expect(crossedMark(400, 0)).toBe(0);
  });

  test('is silent between marks', () => {
    expect(crossedMark(4 * 60_000, 3 * 60_000)).toBeNull();
    expect(crossedMark(0, 0)).toBeNull();
  });

  test('a long gap reports the lowest mark reached', () => {
    expect(crossedMark(6 * 60_000, 0)).toBe(0);
  });
});
