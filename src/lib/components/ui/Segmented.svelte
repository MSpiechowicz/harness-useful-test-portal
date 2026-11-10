<script lang="ts" generics="V extends string">
  interface SegmentOption {
    value: V;
    label: string;
    /** Secondary line under the label. */
    sub?: string;
  }

  interface Props {
    /** Accessible name of the group. */
    label: string;
    options: SegmentOption[];
    value: V;
    disabled?: boolean;
    onchange: (value: V) => void;
  }

  let { label, options, value, disabled = false, onchange }: Props = $props();

  const buttons: Record<string, HTMLButtonElement | undefined> = {};
  const selected = $derived(options.find((option) => option.value === value) ?? options[0]);

  function choose(index: number, focus: boolean) {
    const next = options[(index + options.length) % options.length];

    onchange(next.value);
    if (focus) buttons[next.value]?.focus();
  }

  /* Arrow keys move and select, Home and End jump, like a native radio group. */
  function onkeydown(event: KeyboardEvent) {
    const index = options.findIndex((option) => option.value === selected.value);

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') choose(index + 1, true);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') choose(index - 1, true);
    else if (event.key === 'Home') choose(0, true);
    else if (event.key === 'End') choose(options.length - 1, true);
    else return;

    event.preventDefault();
  }
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    {@const active = option.value === selected.value}
    <button
      bind:this={buttons[option.value]}
      type="button"
      role="radio"
      class="segment"
      class:active
      aria-checked={active}
      tabindex={active ? 0 : -1}
      {disabled}
      onclick={() => onchange(option.value)}
      {onkeydown}
    >
      <span class="segment-label">{option.label}</span>
      {#if option.sub}<span class="segment-sub">{option.sub}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .segment {
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: transparent;
    text-align: left;
    transition:
      border-color 0.15s,
      background-color 0.15s;
  }

  .segment:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  }

  .segment.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .segment:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .segment-label {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .active .segment-label {
    color: var(--text-strong);
  }

  .segment-sub {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    color: var(--muted);
  }
</style>
