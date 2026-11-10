<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    tone?: 'neutral' | 'accent' | 'warning' | 'danger';
    /** Anchor target for an in-app link pill. */
    href?: string;
    children: Snippet;
  }

  let { tone = 'neutral', href, children }: Props = $props();
</script>

{#if href}
  <a class="pill {tone}" {href}>{@render children()}</a>
{:else}
  <span class="pill {tone}">{@render children()}</span>
{/if}

<style>
  .pill {
    display: inline-block;
    padding: 3px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.4;
    color: var(--muted);
    text-decoration: none;
    white-space: nowrap;
  }

  a.pill:hover {
    border-color: var(--accent);
    color: var(--text-strong);
  }

  .accent {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--accent);
  }

  a.accent:hover {
    color: var(--accent-hover);
  }

  .warning {
    border-color: var(--warning-border);
    background: var(--warning-soft);
    color: var(--warning);
  }

  .danger {
    border-color: var(--danger-border);
    background: var(--danger-soft);
    color: var(--danger);
  }
</style>
