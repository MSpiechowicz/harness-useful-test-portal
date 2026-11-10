<script lang="ts">
  import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
  import { localize } from '$lib/content/localize';
  import type { CatalogQuestion } from '$lib/content/catalog';
  import type { Option } from '$lib/content/schema';
  import { t } from '$lib/i18n';
  import { isCorrect, type Answer } from '$lib/quiz/score';
  import InlineText from './InlineText.svelte';

  interface Props {
    question: CatalogQuestion;
    answer: Answer | undefined;
    language: string;
    /** Adds a right/wrong line above the details (practice feedback). */
    verdict?: boolean;
    /** Adds a "Your answer" row (the results review). */
    showGiven?: boolean;
  }

  let { question, answer, language, verdict = false, showGiven = false }: Props = $props();

  const correct = $derived(isCorrect(question, answer));

  const optionTexts = $derived.by(() => {
    const options: Option[] = question.type === 'true-false' ? [] : question.options;

    return (ids: string[]): string[] => ids.map((id) => localize(options.find((option) => option.id === id)?.text ?? id, language));
  });

  function describe(value: boolean | string[] | undefined): string[] {
    if (value === undefined) return [];
    if (typeof value === 'boolean') return [value ? t('quiz.true') : t('quiz.false')];

    return optionTexts(value);
  }

  const given = $derived(describe(answer));
  const expected = $derived(describe(question.correct));

  function host(url: string): string {
    return new URL(url).hostname;
  }
</script>

{#if verdict}
  <p class="verdict" class:ok={correct} class:bad={!correct}>
    <span aria-hidden="true">{correct ? '✓' : '✗'}</span>
    {correct ? t('quiz.correctFeedback') : t('quiz.wrongFeedback')}
  </p>
{/if}

<dl class:after-verdict={verdict}>
  {#if showGiven}
    <dt>{t('results.yourAnswer')}</dt>
    <dd>
      {#if given.length === 0}
        <span class="none">{t('results.noAnswer')}</span>
      {:else}
        <ul>
          {#each given as text, index (index)}<li><InlineText {text} /></li>{/each}
        </ul>
      {/if}
    </dd>
  {/if}

  {#if !correct}
    <dt>{t('results.correctAnswer')}</dt>
    <dd>
      <ul>
        {#each expected as text, index (index)}<li><InlineText {text} /></li>{/each}
      </ul>
    </dd>
  {/if}

  <dt>{t('results.explanation')}</dt>
  <dd class="explanation"><InlineText text={localize(question.explanation, language)} /></dd>

  <dt>{t('results.sources')}</dt>
  <dd>
    <ul class="sources">
      {#each question.sources as source (source.url)}
        <li><ExternalLink url={source.url}>{source.title}</ExternalLink> <span class="host">{host(source.url)}</span></li>
      {/each}
    </ul>
  </dd>
</dl>

<style>
  .verdict {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 700;
  }

  .verdict.ok {
    color: var(--accent);
  }

  .verdict.bad {
    color: var(--danger);
  }

  dl {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 10px 16px;
    margin: 16px 0 0;
    padding-top: 14px;
    border-top: 1px solid var(--border);
    font-size: 14px;
    line-height: 1.55;
  }

  dl.after-verdict {
    margin-top: 12px;
  }

  dt {
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.9;
    color: var(--subtle);
  }

  dd {
    margin: 0;
    color: var(--text);
    overflow-wrap: anywhere;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .explanation {
    white-space: pre-line;
  }

  .none {
    color: var(--warning);
  }

  .sources li + li {
    margin-top: 4px;
  }

  .host {
    margin-left: 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--subtle);
  }

  @media (max-width: 640px) {
    dl {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }

    dd + dt {
      margin-top: 8px;
    }
  }
</style>
