<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    tone?: 'neutral' | 'accent' | 'warning' | 'danger';
    children: Snippet;
  }

  let { tone = 'neutral', children }: Props = $props();
</script>

<span class="chip {tone}">{@render children()}</span>

<style>
  .chip {
    display: inline-block;
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--panel-alt);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.4;
    color: var(--text);
    white-space: nowrap;
  }

  .accent {
    border-color: var(--accent-border);
    color: var(--accent);
  }

  .warning {
    border-color: var(--warning-border);
    color: var(--warning);
  }

  .danger {
    border-color: var(--danger-border);
    color: var(--danger);
  }
</style>
