<script lang="ts">
  import Chip from '$lib/components/ui/Chip.svelte';
  import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
  import Pill from '$lib/components/ui/Pill.svelte';
  import { localize } from '$lib/content/localize';
  import type { Option } from '$lib/content/schema';
  import { t } from '$lib/i18n';
  import type { QuestionResult } from '$lib/quiz/score';
  import InlineText from './InlineText.svelte';

  interface Props {
    result: QuestionResult;
    number: number;
    topicTitle: string;
    language: string;
  }

  let { result, number, topicTitle, language }: Props = $props();

  const uid = $props.id();
  const headingId = `review-${uid}`;
  const question = $derived(result.question);

  const status = $derived(result.correct ? 'correct' : result.answered ? 'wrong' : 'unanswered');

  const optionTexts = $derived.by(() => {
    const options: Option[] = question.type === 'true-false' ? [] : question.options;

    return (ids: string[]): string[] => ids.map((id) => localize(options.find((option) => option.id === id)?.text ?? id, language));
  });

  function describe(answer: boolean | string[] | undefined): string[] {
    if (answer === undefined) return [];
    if (typeof answer === 'boolean') return [answer ? t('quiz.true') : t('quiz.false')];

    return optionTexts(answer);
  }

  const given = $derived(describe(result.answer));
  const expected = $derived(describe(question.correct));

  function host(url: string): string {
    return new URL(url).hostname;
  }
</script>

<article class="review {status}" aria-labelledby={headingId}>
  <header>
    <h3 id={headingId}>{t('results.question', { number })}</h3>
    <Pill tone={status === 'correct' ? 'accent' : status === 'wrong' ? 'danger' : 'warning'}>{t(`results.status.${status}`)}</Pill>
    <Chip>{topicTitle}</Chip>
  </header>

  <p class="prompt"><InlineText text={localize(question.prompt, language)} /></p>
  {#if question.code}<pre class="code"><code>{question.code}</code></pre>{/if}

  <dl>
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

    {#if !result.correct}
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
</article>

<style>
  .review {
    padding: 20px 22px;
    border: 1px solid var(--border);
    border-left-width: 3px;
    border-radius: var(--radius-lg);
    background: var(--panel);
  }

  .review.correct {
    border-left-color: var(--accent);
  }

  .review.wrong {
    border-left-color: var(--danger);
  }

  .review.unanswered {
    border-left-color: var(--warning);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    margin-bottom: 12px;
  }

  h3 {
    font-family: var(--font-mono);
    font-size: 14px;
    color: var(--muted);
  }

  .prompt {
    font-size: 16px;
    line-height: 1.55;
    color: var(--text-strong);
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .code {
    margin-top: 12px;
    padding: 12px 14px;
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--panel-alt);
    font-size: 13px;
    line-height: 1.6;
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
