import type { Slug } from '../content/schema';
import type { QuizMode } from '../quiz/state';
import { entryPercent, type HistoryEntry } from './history';

export interface HistorySummary {
  /** Tests counted. */
  count: number;
  /** Mean of the tests' whole percentages, rounded; 0 when there are none. */
  averagePercent: number;
  /** The highest percentage; 0 when there are none. */
  bestPercent: number;
  /** The most recent test, or null when there are none. */
  latest: HistoryEntry | null;
}

export interface TrendPoint {
  id: string;
  finishedAt: number;
  percent: number;
  mode: QuizMode;
}

export interface TopicMastery {
  topic: Slug;
  /** Questions in the topic now. */
  total: number;
  /** Different questions of the topic answered in some test (at most `total`). */
  seen: number;
  /** Seen questions whose latest answer was right (at most `seen`). */
  mastered: number;
  /** `mastered` out of `total`, as a whole percent. */
  percent: number;
}

function byMode(entries: readonly HistoryEntry[], mode?: QuizMode): HistoryEntry[] {
  return mode === undefined ? [...entries] : entries.filter((entry) => entry.mode === mode);
}

function newestFirst(entries: readonly HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => b.finishedAt - a.finishedAt);
}

/** Totals over the tests (of one mode when given). */
export function summarize(entries: readonly HistoryEntry[], mode?: QuizMode): HistorySummary {
  const selected = newestFirst(byMode(entries, mode));

  if (selected.length === 0) return { count: 0, averagePercent: 0, bestPercent: 0, latest: null };

  const percents = selected.map(entryPercent);

  return {
    count: selected.length,
    averagePercent: Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length),
    bestPercent: Math.max(...percents),
    latest: selected[0],
  };
}

/** The latest `limit` tests (of one mode when given), oldest first, ready to plot left to right. */
export function trend(entries: readonly HistoryEntry[], limit: number, mode?: QuizMode): TrendPoint[] {
  return newestFirst(byMode(entries, mode))
    .slice(0, Math.max(0, limit))
    .reverse()
    .map((entry) => ({ id: entry.id, finishedAt: entry.finishedAt, percent: entryPercent(entry), mode: entry.mode }));
}

/**
 * Per topic still in the catalog, how many of its questions have been seen and how many of those were last
 * answered right. Questions and topics that left the catalog do not count.
 */
export function topicMastery(
  entries: readonly HistoryEntry[],
  catalogTopics: readonly { id: Slug; questionCount: number }[],
): TopicMastery[] {
  const latest = new Map<string, { topic: Slug; correct: boolean }>();

  for (const entry of newestFirst(entries)) {
    for (const question of entry.questions) {
      if (!latest.has(question.id)) latest.set(question.id, { topic: question.topic, correct: question.correct });
    }
  }

  const seen = new Map<Slug, number>();
  const mastered = new Map<Slug, number>();

  for (const { topic, correct } of latest.values()) {
    seen.set(topic, (seen.get(topic) ?? 0) + 1);
    if (correct) mastered.set(topic, (mastered.get(topic) ?? 0) + 1);
  }

  return catalogTopics.map((topic) => {
    const seenCount = Math.min(topic.questionCount, seen.get(topic.id) ?? 0);
    const masteredCount = Math.min(seenCount, mastered.get(topic.id) ?? 0);

    return {
      topic: topic.id,
      total: topic.questionCount,
      seen: seenCount,
      mastered: masteredCount,
      percent: topic.questionCount === 0 ? 0 : Math.round((masteredCount / topic.questionCount) * 100),
    };
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The `points` of an SVG polyline for percentages (0 to 100, clamped) drawn left to right in a `width` by
 * `height` box with 100 at the top. No values give an empty string and a single value a flat line across the box.
 */
export function sparklinePoints(values: readonly number[], width: number, height: number): string {
  if (values.length === 0) return '';

  const y = (value: number) => round(height - (Math.min(100, Math.max(0, value)) / 100) * height);

  if (values.length === 1) return `0,${y(values[0])} ${round(width)},${y(values[0])}`;

  const step = width / (values.length - 1);

  return values.map((value, index) => `${round(index * step)},${y(value)}`).join(' ');
}
