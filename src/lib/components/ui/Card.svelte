<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Heading rendered in mono at the top of the card. */
    title?: string;
    eyebrow?: string;
    /** `h2` for page sections, `h3` inside them. */
    headingLevel?: 2 | 3;
    /** Id of the heading, so the card can label a region. */
    headingId?: string;
    /** Shown on the right of the header row. */
    aside?: Snippet;
    children?: Snippet;
  }

  let { title, eyebrow, headingLevel = 2, headingId, aside, children }: Props = $props();
</script>

<section class="card" aria-labelledby={title ? headingId : undefined}>
  {#if title || eyebrow || aside}
    <header>
      <div>
        {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
        {#if title}<svelte:element this={`h${headingLevel}`} id={headingId} class="title">{title}</svelte:element>{/if}
      </div>
      {#if aside}<div class="aside">{@render aside()}</div>{/if}
    </header>
  {/if}

  {@render children?.()}
</section>

<style>
  .card {
    position: relative;
    overflow: hidden;
    padding: 24px 26px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }

  /* Thin accent along the top edge, as on the website's tool cards. */
  .card::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 2px;
    background: linear-gradient(90deg, var(--accent), transparent 70%);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-3);
    margin-bottom: var(--space-4);
  }

  .eyebrow {
    margin-bottom: 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--accent);
  }

  .title {
    font-family: var(--font-mono);
    font-size: 17px;
    letter-spacing: -0.02em;
    color: var(--text-strong);
  }

  @media (max-width: 640px) {
    .card {
      padding: 20px 16px;
    }
  }
</style>
