<script lang="ts">
  import { t, tn } from '$lib/i18n';

  interface Props {
    /** Whether each question has an answer, in test order. */
    answered: boolean[];
    /** Whether each question is flagged for review, in test order. */
    flagged: boolean[];
    current: number;
    onselect: (index: number) => void;
  }

  let { answered, flagged, current, onselect }: Props = $props();

  const total = $derived(answered.length);
  const answeredCount = $derived(answered.filter(Boolean).length);
  const flaggedCount = $derived(flagged.filter(Boolean).length);
  const unansweredCount = $derived(total - answeredCount);

  function labelFor(index: number): string {
    const done = answered[index] ?? false;
    const marked = flagged[index] ?? false;
    const here = index === current;
    const state = done ? (marked ? 'AnsweredFlagged' : 'Answered') : marked ? 'UnansweredFlagged' : 'Unanswered';

    return t(`quiz.navigator${here ? 'Current' : ''}${state}` as 'quiz.navigatorAnswered', { number: index + 1 });
  }
</script>

<nav aria-label={t('quiz.navigator')}>
  <ol>
    {#each answered as done, index (index)}
      <li>
        <button
          type="button"
          class:done
          class:flagged={flagged[index]}
          class:current={index === current}
          aria-current={index === current ? 'step' : undefined}
          aria-label={labelFor(index)}
          onclick={() => onselect(index)}
        >
          {index + 1}
        </button>
      </li>
    {/each}
  </ol>
</nav>

<ul class="legend">
  <li><span class="swatch current" aria-hidden="true"></span>{t('quiz.progress', { current: current + 1, total })}</li>
  <li><span class="swatch done" aria-hidden="true"></span>{t('quiz.answeredCount', { answered: answeredCount, total })}</li>
  <li><span class="swatch" aria-hidden="true"></span>{tn(unansweredCount, 'quiz.unansweredOne', 'quiz.unansweredMany')}</li>
  <li><span class="swatch flagged" aria-hidden="true"></span>{tn(flaggedCount, 'quiz.flaggedCountOne', 'quiz.flaggedCountMany')}</li>
</ul>

<style>
  ol {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button {
    position: relative;
    width: 100%;
    padding: 8px 0;
    border: 1px solid var(--border);
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

  button:hover {
    border-color: var(--accent);
    color: var(--text-strong);
  }

  button.done {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--accent);
  }

  button.current {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
  }

  /* A flag is a corner mark, so it shows on top of the answered and current states. */
  button.flagged::after {
    content: '';
    position: absolute;
    top: -1px;
    right: -1px;
    width: 10px;
    height: 10px;
    border-top-right-radius: var(--radius-md);
    border-bottom-left-radius: 6px;
    background: var(--warning);
  }

  .legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: var(--muted);
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .swatch {
    position: relative;
    flex: none;
    width: 14px;
    height: 14px;
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .swatch.done {
    border-color: var(--accent-border);
    background: var(--accent-soft);
  }

  .swatch.current {
    border-color: var(--accent);
    background: var(--accent);
  }

  .swatch.flagged {
    overflow: hidden;
  }

  .swatch.flagged::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 7px;
    height: 7px;
    border-bottom-left-radius: 4px;
    background: var(--warning);
  }
</style>
