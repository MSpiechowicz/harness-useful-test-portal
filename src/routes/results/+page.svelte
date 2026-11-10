<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import ReviewItem from '$lib/components/quiz/ReviewItem.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import { loadCatalog } from '$lib/content/load';
  import { localize } from '$lib/content/localize';
  import { t, tn } from '$lib/i18n';
  import { resetSession, retrySameSet, session, sessionScore, sessionTimeUsedMs } from '$lib/quiz/session.svelte';
  import { formatClock } from '$lib/quiz/timer';
  import { settingsState } from '$lib/settings/settings.svelte';

  const catalog = loadCatalog();
  const topicTitles = new Map(catalog.topics.map((topic) => [topic.id, topic.title]));

  const language = $derived(settingsState.value.language);
  const score = $derived(sessionScore());
  const timeUsed = $derived(formatClock(sessionTimeUsedMs()));
  const tone = $derived(score.percent >= 70 ? 'accent' : score.percent >= 40 ? 'warning' : 'danger');

  let showAll = $state(false);
  let heading: HTMLHeadingElement | undefined = $state();

  const reviewed = $derived(
    score.results.map((result, index) => ({ result, number: index + 1 })).filter((item) => showAll || !item.result.correct),
  );

  onMount(() => {
    if (session.phase !== 'finished') {
      void goto(session.phase === 'running' ? '/quiz' : '/', { replaceState: true });

      return;
    }

    heading?.focus();
  });

  function topicTitle(id: string): string {
    return localize(topicTitles.get(id) ?? id, language);
  }

  function retry() {
    if (retrySameSet()) void goto('/quiz');
  }

  function newTest() {
    resetSession();
    void goto('/');
  }
</script>

<svelte:head><title>{t('results.title')} · {t('app.name')}</title></svelte:head>

{#if session.phase === 'finished'}
  <div class="container page">
    <header>
      <p class="eyebrow">$ harness test --results</p>
      <h1 tabindex="-1" bind:this={heading}>{t('results.title')}</h1>
    </header>

    <Card title={t('results.summary')} headingId="summary-title">
      <div class="score">
        <p class="percent {tone}"><span class="visually-hidden">{t('results.scoreLabel')}</span> {score.percent}%</p>

        <dl>
          <div>
            <dt>{t('results.correct')}</dt>
            <dd>{t('results.correctOf', { correct: score.correct, total: score.total })}</dd>
          </div>
          <div>
            <dt>{t('results.timeUsed')}</dt>
            <dd>
              {timeUsed}
              {#if session.expired}<Chip tone="danger">{t('results.timeExpired')}</Chip>{/if}
            </dd>
          </div>
        </dl>
      </div>

      <ProgressBar label={t('results.percentLabel', { percent: score.percent })} value={score.percent} {tone} />
    </Card>

    <Card title={t('results.byTopic')} headingId="topics-title">
      <ul class="topics">
        {#each score.topics as entry (entry.topic)}
          <li>
            <div class="topic-row">
              <span class="topic-name">{topicTitle(entry.topic)}</span>
              <span class="topic-score">{entry.correct}/{entry.total} · {Math.round((entry.correct / entry.total) * 100)}%</span>
            </div>
            <ProgressBar
              label={topicTitle(entry.topic)}
              value={entry.correct}
              max={entry.total}
              valueText={t('results.correctOf', { correct: entry.correct, total: entry.total })}
            />
          </li>
        {/each}
      </ul>
    </Card>

    <section aria-labelledby="review-title" class="review">
      <div class="review-head">
        <h2 id="review-title">{t('results.review')}</h2>
        <Toggle label={t('results.showAll')} checked={showAll} onchange={(checked) => (showAll = checked)} />
      </div>

      {#if reviewed.length === 0}
        <p class="all-correct">{t('results.allCorrect')}</p>
      {:else}
        <p class="count" role="status">{tn(reviewed.length, 'results.shownOne', 'results.shownMany', { total: score.total })}</p>
        <div class="items">
          {#each reviewed as item (item.result.question.id)}
            <ReviewItem result={item.result} number={item.number} topicTitle={topicTitle(item.result.question.topic)} {language} />
          {/each}
        </div>
      {/if}
    </section>

    <div class="actions">
      <Button onclick={retry}>{t('results.retry')}</Button>
      <Button variant="secondary" onclick={newTest}>{t('results.newTest')}</Button>
    </div>
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 980px;
    padding-block: 48px 64px;
  }

  .eyebrow {
    margin-bottom: 12px;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--accent);
  }

  h1 {
    font-family: var(--font-mono);
    font-size: clamp(28px, 3.4vw, 40px);
    letter-spacing: -0.04em;
    color: var(--text-strong);
  }

  h1:focus {
    outline: none;
  }

  .score {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 40px;
    margin-bottom: 18px;
  }

  .percent {
    font-family: var(--font-mono);
    font-size: clamp(48px, 7vw, 80px);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.05em;
  }

  .percent.accent {
    color: var(--accent);
  }

  .percent.warning {
    color: var(--warning);
  }

  .percent.danger {
    color: var(--danger);
  }

  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 40px;
    margin: 0;
    font-family: var(--font-mono);
  }

  dt {
    font-size: 12px;
    color: var(--subtle);
  }

  dd {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--text-strong);
  }

  .topics {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .topic-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
    font-size: 14px;
  }

  .topic-name {
    color: var(--text);
  }

  .topic-score {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--muted);
  }

  .review-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    margin-bottom: 16px;
  }

  h2 {
    font-family: var(--font-mono);
    font-size: 20px;
    letter-spacing: -0.03em;
    color: var(--text-strong);
  }

  .count {
    margin-bottom: 12px;
    font-size: 14px;
    color: var(--muted);
  }

  .all-correct {
    padding: 20px;
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-lg);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .items {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
</style>
