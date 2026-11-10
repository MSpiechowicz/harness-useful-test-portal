<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import { localize } from '$lib/content/localize';
  import { t } from '$lib/i18n';
  import type { Answer } from '$lib/quiz/score';
  import type { QuizQuestion } from '$lib/quiz/select';
  import InlineText from './InlineText.svelte';

  interface Props {
    entry: QuizQuestion;
    language: string;
    answer: Answer | undefined;
    onanswer: (answer: Answer | undefined) => void;
  }

  let { entry, language, answer, onanswer }: Props = $props();

  const uid = $props.id();
  const question = $derived(entry.question);
  const selected = $derived(Array.isArray(answer) ? answer : []);
  const answered = $derived(answer !== undefined && (typeof answer === 'boolean' || answer.length > 0));
  const typeLabel = $derived(
    question.type === 'single' ? t('quiz.type.single') : question.type === 'multi' ? t('quiz.type.multi') : t('quiz.type.trueFalse'),
  );

  function pickOne(id: string) {
    onanswer([id]);
  }

  function toggleMany(id: string, checked: boolean) {
    const next = checked ? [...selected, id] : selected.filter((entry) => entry !== id);

    onanswer(next.length > 0 ? next : undefined);
  }
</script>

<fieldset>
  <legend class="meta">
    <Chip tone="accent">{typeLabel}</Chip>
    <Chip>{t(`difficulty.${question.difficulty}`)}</Chip>
  </legend>

  <p class="prompt"><InlineText text={localize(question.prompt, language)} /></p>

  {#if question.code}
    <pre class="code"><code>{question.code}</code></pre>
  {/if}

  <div class="choices">
    {#if question.type === 'true-false'}
      {#each [true, false] as value (value)}
        <label class="choice" class:chosen={answer === value}>
          <input type="radio" name="answer-{uid}" checked={answer === value} onchange={() => onanswer(value)} />
          <span>{value ? t('quiz.true') : t('quiz.false')}</span>
        </label>
      {/each}
    {:else if question.type === 'single'}
      {#each entry.options as option (option.id)}
        <label class="choice" class:chosen={selected.includes(option.id)}>
          <input type="radio" name="answer-{uid}" checked={selected.includes(option.id)} onchange={() => pickOne(option.id)} />
          <span><InlineText text={localize(option.text, language)} /></span>
        </label>
      {/each}
    {:else}
      {#each entry.options as option (option.id)}
        <label class="choice" class:chosen={selected.includes(option.id)}>
          <input
            type="checkbox"
            checked={selected.includes(option.id)}
            onchange={(event) => toggleMany(option.id, event.currentTarget.checked)}
          />
          <span><InlineText text={localize(option.text, language)} /></span>
        </label>
      {/each}
    {/if}
  </div>

  {#if answered}
    <div class="clear">
      <Button variant="ghost" size="sm" onclick={() => onanswer(undefined)}>{t('quiz.clearAnswer')}</Button>
    </div>
  {/if}
</fieldset>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0;
    margin-bottom: 14px;
  }

  .prompt {
    font-size: 19px;
    line-height: 1.5;
    color: var(--text-strong);
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .code {
    margin-top: 16px;
    padding: 14px 16px;
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--panel-alt);
    font-size: 13px;
    line-height: 1.6;
    color: var(--text);
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 20px;
  }

  .choice {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    line-height: 1.5;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background-color 0.15s;
  }

  .choice:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  }

  .choice.chosen {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .choice:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  input {
    margin: 3px 0 0;
  }

  input:focus-visible {
    outline: none;
  }

  .choice span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .clear {
    margin-top: 12px;
  }
</style>
