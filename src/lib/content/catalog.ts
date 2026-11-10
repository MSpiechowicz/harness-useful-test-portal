import type { LocalizedText } from './localize';
import { localize } from './localize';
import type { Question, Slug, TopicFile } from './schema';

/** A question with the topic its folder puts it in. */
export type CatalogQuestion = Question & { topic: Slug };

export interface CatalogTopic {
  id: Slug;
  title: LocalizedText;
  description: LocalizedText;
  group?: LocalizedText;
  order: number;
  questionCount: number;
}

export interface Catalog {
  /** Sorted by `order`, then id. */
  topics: CatalogTopic[];
  /** Sorted by topic order, then id: the stable order used when questions are not shuffled. */
  questions: CatalogQuestion[];
}

export const DEFAULT_TOPIC_ORDER = 1000;

export const EMPTY_CATALOG: Catalog = { topics: [], questions: [] };

export function topicOrder(topic: Pick<TopicFile, 'order'>): number {
  return topic.order ?? DEFAULT_TOPIC_ORDER;
}

export interface TopicGroup {
  /** Localized group label, or null for topics that declare none. */
  label: string | null;
  topics: CatalogTopic[];
}

/** Topics under their `group` label, groups in the order of their first topic and ungrouped topics last. */
export function groupTopics(topics: readonly CatalogTopic[], language: string): TopicGroup[] {
  const groups = new Map<string | null, CatalogTopic[]>();

  for (const topic of topics) {
    const label = topic.group === undefined ? null : localize(topic.group, language);
    const members = groups.get(label);

    if (members) members.push(topic);
    else groups.set(label, [topic]);
  }

  const result = [...groups].map(([label, members]) => ({ label, topics: members }));

  return [...result.filter((group) => group.label !== null), ...result.filter((group) => group.label === null)];
}
