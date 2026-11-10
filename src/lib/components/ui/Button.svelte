<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'md' | 'sm';
    type?: 'button' | 'submit';
    disabled?: boolean;
    /** Renders an anchor to an in-app route instead of a button. */
    href?: string;
    /** Describes what a disabled button is waiting for, linked through aria-describedby. */
    describedby?: string;
    label?: string;
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    href,
    describedby,
    label,
    onclick,
    children,
  }: Props = $props();
</script>

{#if href && !disabled}
  <a class="btn {variant} {size}" {href} aria-label={label} aria-describedby={describedby}>{@render children()}</a>
{:else}
  <button class="btn {variant} {size}" {type} {disabled} aria-label={label} aria-describedby={describedby} {onclick}>
    {@render children()}
  </button>
{/if}

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1.2;
    text-decoration: none;
    white-space: nowrap;
    transition:
      background-color 0.15s,
      border-color 0.15s,
      color 0.15s;
  }

  .md {
    padding: 14px 20px;
  }

  .sm {
    padding: 8px 12px;
    font-size: 13px;
  }

  .primary {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
  }

  .primary:hover:not(:disabled) {
    background: var(--accent-hover);
    color: var(--accent-ink);
  }

  .secondary {
    border-color: var(--border-strong);
    background: transparent;
    color: var(--text);
  }

  .secondary:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text-strong);
  }

  .ghost {
    background: transparent;
    color: var(--muted);
  }

  .ghost:hover:not(:disabled) {
    color: var(--text-strong);
  }

  .danger {
    border-color: var(--danger-border);
    background: var(--danger-soft);
    color: var(--danger);
  }

  .danger:hover:not(:disabled) {
    border-color: var(--danger);
  }

  .btn:disabled {
    border-color: var(--border);
    background: var(--panel-alt);
    color: var(--subtle);
    cursor: not-allowed;
  }
</style>
