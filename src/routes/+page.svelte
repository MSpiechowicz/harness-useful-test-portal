<script lang="ts">
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CheckboxGroup from '$lib/components/ui/CheckboxGroup.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import { groupTopics } from '$lib/content/catalog';
  import { loadCatalog } from '$lib/content/load';
  import { localize } from '$lib/content/localize';
  import { t, tn } from '$lib/i18n';
  import { effectiveCount, filterPool } from '$lib/quiz/select';
  import { resetSession, startQuiz } from '$lib/quiz/session.svelte';
  import { pruneTopics } from '$lib/settings/schema';
  import { settingsState, updateSettings } from '$lib/settings/settings.svelte';

  const catalog = loadCatalog();
  const allIds = catalog.topics.map((topic) => topic.id);

  const settings = $derived(settingsState.value);
  const language = $derived(settings.language);
  const groups = $derived(groupTopics(catalog.topics, language));

  // The stored selection ([] = every topic), minus topics that no longer exist. Local so it can be empty while
  // the user changes their mind; only a non-empty selection is ever saved.
  let selection = $state(initialSelection());

  const filter = $derived({
    testStyle: settings.testStyle,
    difficulties: settings.difficulties,
    topics: selection.length === allIds.length ? [] : selection,
  });
  const pool = $derived(filterPool(catalog.questions, filter));
  const testSize = $derived(effectiveCount(pool.length, settings.questionCount));
  const canStart = $derived(selection.length > 0 && pool.length > 0);

  const blocker = $derived.by(() => {
    if (catalog.questions.length === 0) return t('home.noContent');
    if (selection.length === 0) return t('home.noTopicSelected');
    if (pool.length === 0) return t('home.emptyPool');

    return null;
  });

  function initialSelection(): string[] {
    const stored = pruneTopics(settingsState.value.topics, allIds);

    return stored.length > 0 ? stored : allIds;
  }

  function select(next: string[]) {
    selection = allIds.filter((id) => next.includes(id));
    if (selection.length > 0) updateSettings({ topics: selection.length === allIds.length ? [] : selection });
  }

  function changeGroup(groupIds: string[], picked: string[]) {
    select([...selection.filter((id) => !groupIds.includes(id)), ...picked]);
  }

  function start() {
    if (!canStart) return;

    resetSession();
    if (startQuiz(catalog, { ...settings, topics: filter.topics })) void goto('/quiz');
  }

  const timerText = $derived(settings.timerMinutes === 0 ? t('home.noTimer') : t('home.minutes', { count: settings.timerMinutes }));
  const styleText = $derived(t(`settings.style.${settings.testStyle}`));
  const difficultyText = $derived(
    settings.difficulties.length === 0
      ? t('home.allDifficulties')
      : settings.difficulties.map((value) => t(`difficulty.${value}`)).join(', '),
  );
</script>

<svelte:head><title>{t('app.name')}</title></svelte:head>

<div class="container page">
  <section class="intro" aria-labelledby="intro-title">
    <p class="eyebrow">$ harness test --start<span class="blink">_</span></p>
    <h1 id="intro-title">{t('home.title')}</h1>
    <p class="lead">{t('home.lead')}</p>
  </section>

  <section class="topics" aria-labelledby="topics-title">
    <div class="topics-head">
      <h2 id="topics-title">{t('home.topics')}</h2>
      <Button variant="ghost" size="sm" disabled={selection.length === allIds.length} onclick={() => select(allIds)}
        >{t('home.selectAll')}</Button
      >
    </div>

    {#if catalog.topics.length === 0}
      <p class="empty">{t('home.noContent')}</p>
    {:else}
      <div class="groups">
        {#each groups as group (group.label ?? '')}
          {@const ids = group.topics.map((topic) => topic.id)}
          <CheckboxGroup
            legend={group.label ?? t('home.otherTopics')}
            layout="cards"
            selected={selection.filter((id) => ids.includes(id))}
            options={group.topics.map((topic) => ({
              value: topic.id,
              label: localize(topic.title, language),
              description: localize(topic.description, language),
              meta: tn(topic.questionCount, 'home.questionOne', 'home.questionMany'),
            }))}
            onchange={(picked) => changeGroup(ids, picked)}
          />
        {/each}
      </div>
    {/if}
  </section>

  <Card title={t('home.startSection')} headingId="start-title">
    <p class="available" aria-live="polite">
      <strong>{tn(pool.length, 'home.availableOne', 'home.availableMany')}</strong>
      {#if pool.length > 0}<span>{t('home.testSize', { count: testSize })}</span>{/if}
    </p>

    <ul class="summary" aria-label={t('home.summary')}>
      <li><Chip>{tn(settings.questionCount, 'home.questionOne', 'home.questionMany')}</Chip></li>
      <li><Chip>{timerText}</Chip></li>
      <li><Chip>{styleText}</Chip></li>
      <li><Chip>{difficultyText}</Chip></li>
    </ul>

    <div class="actions">
      <Button disabled={!canStart} describedby={blocker ? 'start-blocker' : undefined} onclick={start}>{t('home.start')}</Button>
      <Button variant="secondary" href="/settings">{t('home.changeSettings')}</Button>
    </div>

    {#if blocker}<p id="start-blocker" class="blocker" role="status">{blocker}</p>{/if}
  </Card>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 40px;
    padding-block: 48px 64px;
  }

  .eyebrow {
    margin-bottom: 16px;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--accent);
  }

  .blink {
    animation: blink 1s steps(1) infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  h1 {
    max-width: 800px;
    font-family: var(--font-mono);
    font-size: clamp(30px, 4.2vw, 52px);
    line-height: 1.05;
    letter-spacing: -0.05em;
    font-weight: 800;
    color: var(--text-strong);
  }

  .lead {
    max-width: 600px;
    margin-top: 18px;
    font-size: 18px;
    line-height: 1.6;
    color: var(--muted);
  }

  .topics-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  h2 {
    font-family: var(--font-mono);
    font-size: 20px;
    letter-spacing: -0.03em;
    color: var(--text-strong);
  }

  .groups {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .empty {
    color: var(--muted);
  }

  .available {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 16px;
    font-family: var(--font-mono);
    font-size: 15px;
    color: var(--muted);
  }

  .available strong {
    color: var(--text-strong);
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 22px;
  }

  .blocker {
    margin-top: 14px;
    color: var(--warning);
  }
</style>
