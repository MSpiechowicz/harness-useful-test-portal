<script lang="ts">
  import ConfirmDialog from '$lib/components/quiz/ConfirmDialog.svelte';
  import TrendChart, { formatDateTime } from '$lib/components/history/TrendChart.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
  import { toneFor } from '$lib/components/ui/ScoreRing.svelte';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import { loadCatalog } from '$lib/content/load';
  import { localize } from '$lib/content/localize';
  import { clearHistory, historyState } from '$lib/history/history.svelte';
  import { entryPercent } from '$lib/history/history';
  import { summarize, topicMastery, trend } from '$lib/history/stats';
  import { t, tn } from '$lib/i18n';
  import { QUIZ_MODES, type QuizMode } from '$lib/quiz/state';
  import { formatClock } from '$lib/quiz/timer';
  import { settingsState } from '$lib/settings/settings.svelte';

  type Filter = 'all' | QuizMode;

  const FILTERS: Filter[] = ['all', ...QUIZ_MODES];
  const TREND_LIMIT = 20;
  const RECENT_LIMIT = 20;

  const catalog = loadCatalog();
  const topicTitles = new Map(catalog.topics.map((topic) => [topic.id, topic.title]));

  const language = $derived(settingsState.value.language);

  let filter = $state<Filter>('all');
  let confirmingClear = $state(false);

  const filterOptions = $derived(FILTERS.map((value) => ({ value, label: t(`history.filter.${value}`) })));
  const mode = $derived(filter === 'all' ? undefined : filter);
  const entries = $derived(mode === undefined ? historyState.entries : historyState.entries.filter((entry) => entry.mode === mode));
  const summary = $derived(summarize(entries));
  const points = $derived(trend(entries, TREND_LIMIT));
  const mastery = $derived(topicMastery(entries, catalog.topics));
  const recent = $derived([...entries].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, RECENT_LIMIT));
  const canClear = $derived(!historyState.readOnly && historyState.error === null);

  function topicTitle(id: string): string {
    return localize(topicTitles.get(id) ?? id, language);
  }

  function confirmClear() {
    confirmingClear = false;
    clearHistory();
    filter = 'all';
  }
</script>

<svelte:head><title>{t('history.title')} · {t('app.name')}</title></svelte:head>

<div class="container page">
  <header>
    <p class="eyebrow">$ harness test --history</p>
    <h1>{t('history.title')}</h1>
    <p class="lead">{t('history.lead')}</p>
  </header>

  {#if historyState.notice}<p class="notice" role="status">{historyState.notice}</p>{/if}
  {#if historyState.error}<p class="notice error" role="alert">{historyState.error}</p>{/if}
  {#if historyState.readOnly}<p class="notice" role="status">{t('history.noticeReadOnly')}</p>{/if}

  {#if historyState.loaded}
    {#if historyState.entries.length === 0}
      <Card>
        <div class="empty">
          <p>{t('history.empty')}</p>
          <Button href="/">{t('history.startTest')}</Button>
        </div>
      </Card>
    {:else}
      <div class="toolbar">
        <Segmented label={t('history.filter')} options={filterOptions} value={filter} onchange={(value) => (filter = value)} />
        {#if canClear}<Button variant="ghost" size="sm" onclick={() => (confirmingClear = true)}>{t('history.clear')}</Button>{/if}
      </div>

      {#if entries.length === 0}
        <p class="empty-filter" role="status">{t('history.emptyFilter')}</p>
      {:else}
        <section aria-labelledby="summary-title">
          <h2 class="visually-hidden" id="summary-title">{t('history.summary')}</h2>
          <dl class="tiles">
            <div class="tile">
              <dt>{t('history.summaryTests')}</dt>
              <dd>{summary.count}</dd>
            </div>
            <div class="tile">
              <dt>{t('history.summaryAverage')}</dt>
              <dd>{t('history.percent', { percent: summary.averagePercent })}</dd>
            </div>
            <div class="tile">
              <dt>{t('history.summaryBest')}</dt>
              <dd>{t('history.percent', { percent: summary.bestPercent })}</dd>
            </div>
            <div class="tile">
              <dt>{t('history.summaryLatest')}</dt>
              <dd>
                {summary.latest ? t('history.percent', { percent: entryPercent(summary.latest) }) : ''}
                {#if summary.latest}<span class="when">{formatDateTime(summary.latest.finishedAt, language)}</span>{/if}
              </dd>
            </div>
          </dl>
        </section>

        <Card title={t('history.trend')} headingId="trend-title">
          <TrendChart {points} />
        </Card>

        <section aria-labelledby="mastery-title" class="mastery">
          <div class="section-head">
            <h2 id="mastery-title">{t('history.mastery')}</h2>
            <p class="hint">{t('history.masteryHint')}</p>
          </div>

          <ul class="cards">
            {#each mastery as item (item.topic)}
              <li>
                <div class="topic-row">
                  <span class="topic-name">{topicTitle(item.topic)}</span>
                  <span class="topic-percent">{t('history.percent', { percent: item.percent })}</span>
                </div>
                <ProgressBar
                  label={topicTitle(item.topic)}
                  value={item.percent}
                  tone={toneFor(item.percent)}
                  valueText={t('history.percent', { percent: item.percent })}
                />
                <p class="seen">{tn(item.total, 'history.seenOne', 'history.seenMany', { seen: item.seen })}</p>
              </li>
            {/each}
          </ul>
        </section>

        <section aria-labelledby="recent-title" class="recent">
          <h2 id="recent-title">{t('history.recent')}</h2>

          <!-- A scrollable region must be reachable by keyboard. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div class="table-wrap" role="region" aria-labelledby="recent-title" tabindex="0">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('history.col.date')}</th>
                  <th scope="col">{t('history.col.mode')}</th>
                  <th scope="col" class="num">{t('history.col.score')}</th>
                  <th scope="col" class="num">{t('history.col.time')}</th>
                </tr>
              </thead>
              <tbody>
                {#each recent as entry (entry.id)}
                  {@const percent = entryPercent(entry)}
                  <tr>
                    <td>{formatDateTime(entry.finishedAt, language)}</td>
                    <td>{t(`results.mode.${entry.mode}`)}</td>
                    <td class="num">
                      <span class="score {toneFor(percent)}">{t('history.percent', { percent })}</span>
                      <span class="fraction">{entry.correct}/{entry.total}</span>
                    </td>
                    <td class="num">
                      {formatClock(entry.durationMs)}
                      {#if entry.expired}<Chip tone="danger">{t('history.expired')}</Chip>{/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}
    {/if}
  {/if}
</div>

<ConfirmDialog
  open={confirmingClear}
  title={t('history.clearTitle')}
  body={t('history.clearBody')}
  confirmLabel={t('history.clearConfirm')}
  cancelLabel={t('history.clearCancel')}
  tone="danger"
  onconfirm={confirmClear}
  oncancel={() => (confirmingClear = false)}
/>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 28px;
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

  .lead {
    max-width: 600px;
    margin-top: 12px;
    line-height: 1.6;
    color: var(--muted);
  }

  h2 {
    font-family: var(--font-mono);
    font-size: 20px;
    letter-spacing: -0.03em;
    color: var(--text-strong);
  }

  .notice {
    padding: 12px 16px;
    border: 1px solid var(--warning-border);
    border-radius: var(--radius-lg);
    background: var(--warning-soft);
    color: var(--warning);
  }

  .notice.error {
    border-color: var(--danger-border);
    background: var(--danger-soft);
    color: var(--danger);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 18px;
    color: var(--muted);
  }

  .empty-filter {
    padding: 20px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    color: var(--muted);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr));
    gap: 12px;
    margin: 0;
  }

  .tile {
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
    transition: border-color 0.15s;
  }

  .tile:hover {
    border-color: var(--accent-border);
  }

  dt {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--subtle);
  }

  dd {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    margin: 6px 0 0;
    font-family: var(--font-mono);
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: var(--text-strong);
  }

  .when {
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0;
    color: var(--muted);
  }

  .section-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 16px;
    margin-bottom: 14px;
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cards li {
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--panel);
    transition: border-color 0.15s;
  }

  .cards li:hover {
    border-color: var(--accent-border);
  }

  .topic-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    font-size: 14px;
  }

  .topic-name {
    color: var(--text);
  }

  .topic-percent {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--muted);
  }

  .seen {
    margin-top: 8px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--subtle);
  }

  .recent h2 {
    margin-bottom: 14px;
  }

  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }

  .table-wrap:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  th,
  td {
    padding: 12px 16px;
    text-align: left;
    white-space: nowrap;
  }

  th {
    border-bottom: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 400;
    color: var(--subtle);
  }

  tbody tr + tr td {
    border-top: 1px solid var(--border-soft);
  }

  tbody tr {
    transition: background-color 0.15s;
  }

  tbody tr:hover {
    background: var(--panel-alt);
  }

  .num {
    text-align: right;
  }

  .score {
    font-family: var(--font-mono);
    font-weight: 700;
  }

  .score.accent {
    color: var(--accent);
  }

  .score.warning {
    color: var(--warning);
  }

  .score.danger {
    color: var(--danger);
  }

  .fraction {
    margin-left: 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--subtle);
  }
</style>
