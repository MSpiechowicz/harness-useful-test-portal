<script lang="ts">
  import Chip from '$lib/components/ui/Chip.svelte';
  import Pill from '$lib/components/ui/Pill.svelte';
  import { localize } from '$lib/content/localize';
  import { t } from '$lib/i18n';
  import type { QuestionResult } from '$lib/quiz/score';
  import AnswerFeedback from './AnswerFeedback.svelte';
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
</script>

<article class="review {status}" aria-labelledby={headingId}>
  <header>
    <h3 id={headingId}>{t('results.question', { number })}</h3>
    <Pill tone={status === 'correct' ? 'accent' : status === 'wrong' ? 'danger' : 'warning'}>{t(`results.status.${status}`)}</Pill>
    <Chip>{topicTitle}</Chip>
  </header>

  <p class="prompt"><InlineText text={localize(question.prompt, language)} /></p>
  {#if question.code}
    <!-- A scrollable code block has to be reachable by keyboard. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre class="code" tabindex="0" role="region" aria-label={t('common.code')}><code>{question.code}</code></pre>
  {/if}

  <AnswerFeedback {question} answer={result.answer} {language} showGiven />
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
</style>
