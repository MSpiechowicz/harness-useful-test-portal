<script lang="ts">
  import { t } from '$lib/i18n';

  interface Props {
    /** Whether each question has an answer, in test order. */
    answered: boolean[];
    current: number;
    onselect: (index: number) => void;
  }

  let { answered, current, onselect }: Props = $props();
</script>

<nav aria-label={t('quiz.navigator')}>
  <ol>
    {#each answered as done, index (index)}
      <li>
        <button
          type="button"
          class:done
          class:current={index === current}
          aria-current={index === current ? 'step' : undefined}
          aria-label={t(done ? 'quiz.navigatorAnswered' : 'quiz.navigatorUnanswered', { number: index + 1 })}
          onclick={() => onselect(index)}
        >
          {index + 1}
        </button>
      </li>
    {/each}
  </ol>
</nav>

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
    width: 100%;
    padding: 8px 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: transparent;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--muted);
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
</style>
