<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import AnswerFeedback from '$lib/components/quiz/AnswerFeedback.svelte';
  import ConfirmDialog from '$lib/components/quiz/ConfirmDialog.svelte';
  import Navigator from '$lib/components/quiz/Navigator.svelte';
  import QuestionView from '$lib/components/quiz/QuestionView.svelte';
  import ShortcutsDialog from '$lib/components/quiz/ShortcutsDialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Pill from '$lib/components/ui/Pill.svelte';
  import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
  import { loadCatalog } from '$lib/content/load';
  import { localize } from '$lib/content/localize';
  import { t, tn } from '$lib/i18n';
  import { finishQuiz, goTo, pauseQuiz, revealCurrent, session, setAnswer, snapshotTick, toggleFlag } from '$lib/quiz/session.svelte';
  import { isAnswered, isCorrect } from '$lib/quiz/score';
  import { describeTarget, optionAnswer, shortcutFor, type ShortcutAction } from '$lib/quiz/shortcuts';
  import { crossedMark, formatClock, isExpired, remainingMs } from '$lib/quiz/timer';
  import { settingsState } from '$lib/settings/settings.svelte';

  const catalog = loadCatalog();
  const topicTitles = new Map(catalog.topics.map((topic) => [topic.id, topic.title]));

  const language = $derived(settingsState.value.language);
  const total = $derived(session.questions.length);
  const entry = $derived(session.questions[session.current]);
  const practice = $derived(session.mode === 'practice');
  const answered = $derived(session.questions.map((item) => isAnswered(session.answers[item.question.id])));
  const flagged = $derived(session.questions.map((item) => session.flagged.includes(item.question.id)));
  const answeredCount = $derived(answered.filter(Boolean).length);
  const unansweredCount = $derived(total - answeredCount);
  const flaggedCount = $derived(flagged.filter(Boolean).length);

  const currentAnswer = $derived(entry ? session.answers[entry.question.id] : undefined);
  const currentFlagged = $derived(flagged[session.current] ?? false);
  const revealed = $derived(entry ? session.revealed.includes(entry.question.id) : false);
  const canCheck = $derived(practice && !revealed && isAnswered(currentAnswer));
  const progressText = $derived(t('quiz.answeredCount', { answered: answeredCount, total }));

  let now = $state(Date.now());
  let confirmSubmit = $state(false);
  let leaveTarget: string | null = $state(null);
  let helpOpen = $state(false);
  let announcement = $state('');
  let questionEl: HTMLDivElement | undefined = $state();
  let finishing = false;

  // Shortcuts stay off while any dialog is up, so keys never act on the page behind it.
  const dialogOpen = $derived(confirmSubmit || leaveTarget !== null || helpOpen);

  const remaining = $derived(session.deadline === null ? null : remainingMs(session.deadline, now));
  const timerTone = $derived(
    remaining === null ? 'neutral' : remaining <= 60_000 ? 'danger' : remaining <= 5 * 60_000 ? 'warning' : 'accent',
  );

  // The submit dialog speaks about unanswered questions first, flagged ones second; either alone is enough to ask.
  const confirmTitle = $derived(unansweredCount > 0 ? t('quiz.confirmTitle') : t('quiz.confirmFlaggedTitle'));
  const confirmBody = $derived(
    [
      unansweredCount > 0 ? tn(unansweredCount, 'quiz.confirmBodyOne', 'quiz.confirmBodyMany') : '',
      flaggedCount > 0 ? tn(flaggedCount, 'quiz.confirmFlaggedOne', 'quiz.confirmFlaggedMany') : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  onMount(() => {
    if (session.phase !== 'running') {
      void goto(session.phase === 'finished' ? '/results' : '/', { replaceState: true });

      return;
    }

    now = Date.now();

    const handle = setInterval(onTick, 250);

    return () => clearInterval(handle);
  });

  // An absolute deadline: the remaining time is always recomputed from the clock, so a slow tick never drifts.
  function onTick() {
    const previous = session.deadline === null ? null : remainingMs(session.deadline, now);

    now = Date.now();
    snapshotTick(now);

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
    if (unansweredCount > 0 || flaggedCount > 0) confirmSubmit = true;
    else complete(false);
  }

  // Leaving mid-test (header links) asks first, then pauses: the test is saved and can be resumed from Home.
  beforeNavigate((navigation) => {
    if (finishing || session.phase !== 'running' || navigation.willUnload) return;

    navigation.cancel();
    leaveTarget = navigation.to?.url.pathname ?? '/';
  });

  function leave() {
    const target = leaveTarget ?? '/';

    leaveTarget = null;
    finishing = true;
    pauseQuiz();
    void goto(target);
  }

  /**
   * Runs a change that can remove or disable the focused control (a new question, a locked answer) and, if focus
   * was on the page and got lost, puts it on the question so keyboard users do not restart from the top.
   */
  async function keepFocus(change: () => void) {
    const before = document.activeElement;
    const hadFocus = before instanceof HTMLElement && before !== document.body;

    change();

    if (!hadFocus) return;

    await tick();

    const active = document.activeElement;
    const disabled = active !== null && 'disabled' in active && active.disabled === true;

    if (active === null || active === document.body || disabled) questionEl?.focus({ preventScroll: true });
  }

  function check() {
    void keepFocus(revealCurrent);
  }

  function move(index: number) {
    void keepFocus(() => goTo(index));
  }

  /** Whether the action did something, so only handled keys have their default behaviour cancelled. */
  function run(action: ShortcutAction): boolean {
    if (!entry) return false;

    switch (action.type) {
      case 'option': {
        if (revealed) return false;

        const next = optionAnswer(entry, currentAnswer, action.index);

        if (next === 'none') return false;

        setAnswer(entry.question.id, next);

        return true;
      }
      case 'next':
        move(session.current + 1);

        return true;
      case 'previous':
        move(session.current - 1);

        return true;
      case 'flag':
        toggleFlag(entry.question.id);

        return true;
      case 'check':
        if (!canCheck) return false;

        check();

        return true;
      case 'submit':
        submit();

        return true;
      case 'help':
        helpOpen = true;

        return true;
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (session.phase !== 'running') return;

    const action = shortcutFor(
      {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        repeat: event.repeat,
        target: describeTarget(event.target),
      },
      dialogOpen,
    );

    if (action && run(action)) event.preventDefault();
  }
</script>

<svelte:head><title>{t('quiz.title')} · {t('app.name')}</title></svelte:head>

<svelte:window {onkeydown} />

{#if session.phase === 'running' && entry}
  <div class="container page">
    <div class="top">
      <div class="bar">
        <p class="progress">
          <strong>{t('quiz.progress', { current: session.current + 1, total })}</strong>
          <span>{progressText}</span>
        </p>

        <div class="right">
          {#if practice}
            <Pill tone="accent">{t('quiz.practice')}</Pill>
          {:else if remaining !== null}
            <Pill tone={timerTone}>
              <span class="timer" role="timer"><span class="visually-hidden">{t('quiz.timeLeft')}</span> {formatClock(remaining)}</span>
            </Pill>
          {:else}
            <Pill>{t('quiz.noTimer')}</Pill>
          {/if}
          <Button size="sm" onclick={submit}>{t('quiz.submit')}</Button>
        </div>
      </div>

      <ProgressBar label={progressText} value={answeredCount} max={total} valueText={progressText} />
    </div>

    <!-- Announced at 5 minutes, 1 minute and expiry only; the ticking clock itself is silent. -->
    <p class="visually-hidden" role="status" aria-live="assertive">{announcement}</p>

    <div class="layout">
      <div class="main">
        <Card eyebrow={localize(topicTitles.get(entry.question.topic) ?? entry.question.topic, language)}>
          {#snippet aside()}
            <button
              type="button"
              class="flag"
              class:on={currentFlagged}
              aria-pressed={currentFlagged}
              onclick={() => toggleFlag(entry.question.id)}
            >
              <span aria-hidden="true">{currentFlagged ? '⚑' : '⚐'}</span>
              {t('quiz.flag')}
            </button>
          {/snippet}

          <div class="question" tabindex="-1" bind:this={questionEl}>
            {#key entry.question.id}
              <QuestionView
                {entry}
                {language}
                answer={currentAnswer}
                locked={revealed}
                reveal={revealed}
                onanswer={(answer) => setAnswer(entry.question.id, answer)}
              />
            {/key}
          </div>
        </Card>

        {#if practice}
          <div class="feedback-live" aria-live="polite">
            {#if revealed}
              <section class="feedback" class:ok={isCorrect(entry.question, currentAnswer)}>
                <AnswerFeedback question={entry.question} answer={currentAnswer} {language} verdict />
              </section>
            {/if}
          </div>
        {/if}

        <div class="nav-buttons">
          <Button variant="secondary" disabled={session.current === 0} onclick={() => move(session.current - 1)}
            >{t('quiz.previous')}</Button
          >

          <div class="forward">
            {#if practice}
              <Button variant="secondary" disabled={!canCheck} onclick={check}>{t('quiz.check')}</Button>
            {/if}
            {#if session.current < total - 1}
              <Button variant="secondary" onclick={() => move(session.current + 1)}>{t('quiz.next')}</Button>
            {:else}
              <Button onclick={submit}>{t('quiz.submit')}</Button>
            {/if}
          </div>
        </div>
      </div>

      <aside aria-label={t('quiz.navigator')}>
        <h2>{t('quiz.navigator')}</h2>
        <Navigator {answered} {flagged} current={session.current} onselect={move} />

        <div class="shortcuts">
          <div class="shortcuts-head">
            <h2>{t('quiz.shortcuts.heading')}</h2>
            <button type="button" class="help" aria-label={t('quiz.shortcuts.open')} onclick={() => (helpOpen = true)}><kbd>?</kbd></button>
          </div>

          <ul>
            <li><span>{t('quiz.next')}</span><span class="keys"><kbd>n</kbd><kbd>→</kbd></span></li>
            <li><span>{t('quiz.previous')}</span><span class="keys"><kbd>p</kbd><kbd>←</kbd></span></li>
            <li><span>{t('quiz.flag')}</span><span class="keys"><kbd>f</kbd></span></li>
            {#if practice}
              <li><span>{t('quiz.check')}</span><span class="keys"><kbd>c</kbd></span></li>
            {/if}
            <li><span>{t('quiz.submit')}</span><span class="keys"><kbd>Ctrl</kbd><kbd>Enter</kbd></span></li>
          </ul>
        </div>
      </aside>
    </div>
  </div>

  <ConfirmDialog
    open={confirmSubmit}
    title={confirmTitle}
    body={confirmBody}
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
    onconfirm={leave}
    oncancel={() => (leaveTarget = null)}
  />

  <ShortcutsDialog open={helpOpen} onclose={() => (helpOpen = false)} />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-block: 32px 64px;
  }

  .top {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 20px;
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
    font-size: 16px;
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

  /* Focus lands here only from code, after a question changed under the focused control. */
  .question:focus {
    outline: none;
  }

  .flag {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: transparent;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--muted);
    transition:
      border-color 0.15s,
      background-color 0.15s,
      color 0.15s;
  }

  .flag:hover {
    border-color: var(--warning);
    color: var(--text-strong);
  }

  .flag.on {
    border-color: var(--warning-border);
    background: var(--warning-soft);
    color: var(--warning);
  }

  .feedback {
    padding: 20px 22px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--danger);
    border-radius: var(--radius-lg);
    background: var(--panel);
  }

  .feedback.ok {
    border-left-color: var(--accent);
  }

  .nav-buttons {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .forward {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
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

  .shortcuts {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--border-soft);
  }

  .shortcuts-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .shortcuts-head h2 {
    margin: 0;
  }

  .help {
    padding: 2px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
  }

  .help:hover kbd {
    border-color: var(--accent);
    color: var(--text-strong);
  }

  .shortcuts ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: var(--muted);
  }

  .shortcuts li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .keys {
    display: inline-flex;
    gap: 4px;
  }

  kbd {
    min-width: 22px;
    padding: 1px 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--panel-alt);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
    color: var(--subtle);
    transition:
      border-color 0.15s,
      color 0.15s;
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
