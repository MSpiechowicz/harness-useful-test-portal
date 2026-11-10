<script lang="ts">
  import { onMount } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import ConfirmDialog from '$lib/components/quiz/ConfirmDialog.svelte';
  import Navigator from '$lib/components/quiz/Navigator.svelte';
  import QuestionView from '$lib/components/quiz/QuestionView.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Pill from '$lib/components/ui/Pill.svelte';
  import { loadCatalog } from '$lib/content/load';
  import { localize } from '$lib/content/localize';
  import { t, tn } from '$lib/i18n';
  import { goTo, finishQuiz, resetSession, session, setAnswer } from '$lib/quiz/session.svelte';
  import { isAnswered } from '$lib/quiz/score';
  import { crossedMark, formatClock, isExpired, remainingMs } from '$lib/quiz/timer';
  import { settingsState } from '$lib/settings/settings.svelte';

  const catalog = loadCatalog();
  const topicTitles = new Map(catalog.topics.map((topic) => [topic.id, topic.title]));

  const language = $derived(settingsState.value.language);
  const total = $derived(session.questions.length);
  const entry = $derived(session.questions[session.current]);
  const answered = $derived(session.questions.map((item) => isAnswered(session.answers[item.question.id])));
  const answeredCount = $derived(answered.filter(Boolean).length);
  const unansweredCount = $derived(total - answeredCount);

  let now = $state(Date.now());
  let confirmSubmit = $state(false);
  let leaveTarget: string | null = $state(null);
  let announcement = $state('');
  let finishing = false;

  const remaining = $derived(session.deadline === null ? null : remainingMs(session.deadline, now));
  const timerTone = $derived(
    remaining === null ? 'neutral' : remaining <= 60_000 ? 'danger' : remaining <= 5 * 60_000 ? 'warning' : 'accent',
  );

  onMount(() => {
    if (session.phase !== 'running') {
      void goto(session.phase === 'finished' ? '/results' : '/', { replaceState: true });

      return;
    }

    now = Date.now();

    const handle = setInterval(tick, 250);

    return () => clearInterval(handle);
  });

  // An absolute deadline: the remaining time is always recomputed from the clock, so a slow tick never drifts.
  function tick() {
    const previous = session.deadline === null ? null : remainingMs(session.deadline, now);

    now = Date.now();

    if (session.deadline === null || previous === null) return;

    const mark = crossedMark(previous, remainingMs(session.deadline, now));

    if (mark === 5 * 60_000) announcement = t('quiz.announce.fiveMinutes');
    else if (mark === 60_000) announcement = t('quiz.announce.oneMinute');

    if (isExpired(session.deadline, now)) {
      announcement = t('quiz.announce.expired');
      complete(true);
    }
  }

  function complete(expired: boolean) {
    if (finishing) return;

    finishing = true;
    confirmSubmit = false;
    finishQuiz(expired);
    void goto('/results');
  }

  function submit() {
    if (unansweredCount > 0) confirmSubmit = true;
    else complete(false);
  }

  // Leaving mid-test (header links) asks first, because the test is dropped.
  beforeNavigate((navigation) => {
    if (finishing || session.phase !== 'running' || navigation.willUnload) return;

    navigation.cancel();
    leaveTarget = navigation.to?.url.pathname ?? '/';
  });

  function leave() {
    const target = leaveTarget ?? '/';

    leaveTarget = null;
    finishing = true;
    resetSession();
    void goto(target);
  }
</script>

<svelte:head><title>{t('quiz.title')} · {t('app.name')}</title></svelte:head>

{#if session.phase === 'running' && entry}
  <div class="container page">
    <div class="bar">
      <p class="progress">
        <strong>{t('quiz.progress', { current: session.current + 1, total })}</strong>
        <span>{t('quiz.answeredCount', { answered: answeredCount, total })}</span>
      </p>

      <div class="right">
        {#if remaining !== null}
          <Pill tone={timerTone === 'neutral' ? 'neutral' : timerTone}>
            <span class="timer" role="timer"><span class="visually-hidden">{t('quiz.timeLeft')}</span> {formatClock(remaining)}</span>
          </Pill>
        {:else}
          <Pill>{t('quiz.noTimer')}</Pill>
        {/if}
        <Button size="sm" onclick={submit}>{t('quiz.submit')}</Button>
      </div>
    </div>

    <!-- Announced at 5 minutes, 1 minute and expiry only; the ticking clock itself is silent. -->
    <p class="visually-hidden" role="status" aria-live="assertive">{announcement}</p>

    <div class="layout">
      <div class="main">
        <Card eyebrow={localize(topicTitles.get(entry.question.topic) ?? entry.question.topic, language)}>
          {#key entry.question.id}
            <QuestionView
              {entry}
              {language}
              answer={session.answers[entry.question.id]}
              onanswer={(answer) => setAnswer(entry.question.id, answer)}
            />
          {/key}
        </Card>

        <div class="nav-buttons">
          <Button variant="secondary" disabled={session.current === 0} onclick={() => goTo(session.current - 1)}
            >{t('quiz.previous')}</Button
          >
          {#if session.current < total - 1}
            <Button variant="secondary" onclick={() => goTo(session.current + 1)}>{t('quiz.next')}</Button>
          {:else}
            <Button onclick={submit}>{t('quiz.submit')}</Button>
          {/if}
        </div>
      </div>

      <aside aria-label={t('quiz.navigator')}>
        <h2>{t('quiz.navigator')}</h2>
        <Navigator {answered} current={session.current} onselect={goTo} />
        <p class="legend">{tn(unansweredCount, 'quiz.unansweredOne', 'quiz.unansweredMany')}</p>
      </aside>
    </div>
  </div>

  <ConfirmDialog
    open={confirmSubmit}
    title={t('quiz.confirmTitle')}
    body={tn(unansweredCount, 'quiz.confirmBodyOne', 'quiz.confirmBodyMany')}
    confirmLabel={t('quiz.confirmSubmit')}
    cancelLabel={t('quiz.keepGoing')}
    onconfirm={() => complete(false)}
    oncancel={() => (confirmSubmit = false)}
  />

  <ConfirmDialog
    open={leaveTarget !== null}
    title={t('quiz.leaveTitle')}
    body={t('quiz.leaveBody')}
    confirmLabel={t('quiz.leave')}
    cancelLabel={t('quiz.stay')}
    tone="danger"
    onconfirm={leave}
    oncancel={() => (leaveTarget = null)}
  />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-block: 32px 64px;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-soft);
  }

  .progress {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 14px;
    font-family: var(--font-mono);
    font-size: 14px;
    color: var(--muted);
  }

  .progress strong {
    color: var(--text-strong);
  }

  .right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .timer {
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 24px;
    align-items: start;
  }

  .main {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .nav-buttons {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  aside {
    position: sticky;
    top: 16px;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }

  h2 {
    margin-bottom: 12px;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 400;
    color: var(--muted);
  }

  .legend {
    margin-top: 12px;
    font-size: 13px;
    color: var(--muted);
  }

  @media (max-width: 820px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }

    aside {
      position: static;
    }
  }
</style>
