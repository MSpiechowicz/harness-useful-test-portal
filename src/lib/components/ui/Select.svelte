<script lang="ts">
  interface SelectOption {
    value: string;
    label: string;
  }

  interface Props {
    label: string;
    value: string;
    options: SelectOption[];
    hint?: string;
    onchange: (value: string) => void;
  }

  let { label, value, options, hint, onchange }: Props = $props();

  const uid = $props.id();
  const selectId = `select-${uid}`;
  const hintId = `select-hint-${uid}`;
</script>

<div class="field">
  <label for={selectId}>{label}</label>

  <div class="wrap">
    <select id={selectId} {value} aria-describedby={hint ? hintId : undefined} onchange={(event) => onchange(event.currentTarget.value)}>
      {#each options as option (option.value)}
        <option value={option.value} selected={option.value === value}>{option.label}</option>
      {/each}
    </select>
    <svg class="caret" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true" focusable="false">
      <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </div>

  {#if hint}<p id={hintId} class="hint">{hint}</p>{/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--muted);
  }

  .wrap {
    position: relative;
    display: inline-block;
    max-width: 280px;
  }

  select {
    width: 100%;
    padding: 9px 36px 9px 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--panel-alt);
    color: var(--text-strong);
    font-family: var(--font-mono);
    font-size: 14px;
    appearance: none;
  }

  select:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border-strong));
  }

  select:focus-visible {
    border-color: var(--accent);
  }

  .caret {
    position: absolute;
    top: 50%;
    right: 14px;
    translate: 0 -50%;
    color: var(--muted);
    pointer-events: none;
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }
</style>
