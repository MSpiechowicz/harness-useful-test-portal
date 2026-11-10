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
    /** The answer can no longer be changed (a checked practice question). */
    locked?: boolean;
    /** Marks the correct options and a wrong choice; meant for a locked question. */
    reveal?: boolean;
  }

  let { entry, language, answer, onanswer, locked = false, reveal = false }: Props = $props();

  interface Choice {
    id: string;
    text: string;
    chosen: boolean;
    correct: boolean;
    /** Radios report a pick, checkboxes report whether the box is now checked. */
    pick: (checked: boolean) => void;
  }

  const uid = $props.id();
  const promptId = `prompt-${uid}`;
  const question = $derived(entry.question);
  const selected = $derived(Array.isArray(answer) ? answer : []);
  const answered = $derived(answer !== undefined && (typeof answer === 'boolean' || answer.length > 0));
  const typeLabel = $derived(
    question.type === 'single' ? t('quiz.type.single') : question.type === 'multi' ? t('quiz.type.multi') : t('quiz.type.trueFalse'),
  );
  const inputType = $derived(question.type === 'multi' ? 'checkbox' : 'radio');

  const choices = $derived.by((): Choice[] => {
    if (question.type === 'true-false') {
      const expected = question.correct;

      return [true, false].map((value) => ({
        id: String(value),
        text: value ? t('quiz.true') : t('quiz.false'),
        chosen: answer === value,
        correct: expected === value,
        pick: () => onanswer(value),
      }));
    }

    const expected = question.correct;

    return entry.options.map((option) => ({
      id: option.id,
      text: localize(option.text, language),
      chosen: selected.includes(option.id),
      correct: expected.includes(option.id),
      pick: (checked) => (question.type === 'single' ? onanswer([option.id]) : toggleMany(option.id, checked)),
    }));
  });

  function toggleMany(id: string, checked: boolean) {
    const next = checked ? [...selected, id] : selected.filter((item) => item !== id);

    onanswer(next.length > 0 ? next : undefined);
  }

  function markOf(choice: Choice): 'correct' | 'wrong' | undefined {
    if (!reveal) return undefined;
    if (choice.correct) return 'correct';
    if (choice.chosen) return 'wrong';

    return undefined;
  }
</script>

<fieldset aria-labelledby={promptId} disabled={locked}>
  <div class="meta">
    <Chip tone="accent">{typeLabel}</Chip>
    <Chip>{t(`difficulty.${question.difficulty}`)}</Chip>
  </div>

  <p class="prompt" id={promptId}><InlineText text={localize(question.prompt, language)} /></p>

  {#if question.code}
    <!-- A scrollable code block has to be reachable by keyboard. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre class="code" tabindex="0" role="region" aria-label={t('common.code')}><code>{question.code}</code></pre>
  {/if}

  <div class="choices">
    {#each choices as choice, index (choice.id)}
      {@const mark = markOf(choice)}
      <label class="choice" class:chosen={choice.chosen} class:locked class:correct={mark === 'correct'} class:wrong={mark === 'wrong'}>
        <input
          type={inputType}
          name={inputType === 'radio' ? `answer-${uid}` : undefined}
          checked={choice.chosen}
          onchange={(event) => choice.pick(event.currentTarget.checked)}
        />
        <span class="text"><InlineText text={choice.text} /></span>
        {#if mark === 'correct'}
          <span class="mark" aria-hidden="true">✓</span><span class="visually-hidden">{t('results.status.correct')}</span>
        {:else if mark === 'wrong'}
          <span class="mark" aria-hidden="true">✗</span><span class="visually-hidden">{t('results.status.wrong')}</span>
        {/if}
        {#if index < 9}<kbd aria-hidden="true">{index + 1}</kbd>{/if}
      </label>
    {/each}
  </div>

  {#if answered && !locked}
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
    margin-bottom: 14px;
  }

  .prompt {
    font-size: 20px;
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
    gap: 10px;
    margin-top: 22px;
  }

  .choice {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    min-height: 52px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    line-height: 1.5;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background-color 0.15s,
      box-shadow 0.15s;
  }

  .choice:hover:not(.locked) {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
    background: color-mix(in srgb, var(--accent) 4%, transparent);
  }

  .choice.chosen {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .choice:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .choice.locked {
    cursor: default;
  }

  .choice.correct {
    border-color: var(--accent);
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .choice.wrong {
    border-color: var(--danger);
    background: var(--danger-soft);
    box-shadow: inset 0 0 0 1px var(--danger);
  }

  input {
    margin: 3px 0 0;
  }

  input:focus-visible {
    outline: none;
  }

  /* A locked answer stays readable: only the pointer and the focus ring change. */
  .choice.locked input:disabled {
    cursor: default;
    opacity: 1;
  }

  .text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .mark {
    flex: none;
    font-family: var(--font-mono);
    font-weight: 700;
    line-height: 1.5;
  }

  .correct .mark {
    color: var(--accent);
  }

  .wrong .mark {
    color: var(--danger);
  }

  kbd {
    flex: none;
    min-width: 22px;
    padding: 1px 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--panel-alt);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
    color: var(--subtle);
  }

  .clear {
    margin-top: 14px;
  }
</style>
