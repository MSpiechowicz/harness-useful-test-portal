<script lang="ts">
  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    /** Shown after the input, e.g. "min". */
    unit?: string;
    /** Help text linked to the input. */
    hint?: string;
    onchange: (value: number) => void;
  }

  let { label, value, min, max, step = 1, unit, hint, onchange }: Props = $props();

  const uid = $props.id();
  const inputId = `number-${uid}`;
  const hintId = `number-hint-${uid}`;

  // The text being typed; follows the committed value, including clamps applied by the parent.
  let draft = $derived(String(value));

  function clamp(next: number): number {
    return Math.min(max, Math.max(min, Math.round(next)));
  }

  function commit(next: number) {
    const clamped = clamp(next);

    draft = String(clamped);
    if (clamped !== value) onchange(clamped);
  }

  function commitDraft() {
    const parsed = Number(draft);

    commit(draft.trim() === '' || Number.isNaN(parsed) ? value : parsed);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
    }
  }
</script>

<div class="field">
  <label for={inputId}>{label}</label>

  <div class="control">
    <button type="button" class="step" aria-label="{label}: -{step}" disabled={value <= min} onclick={() => commit(value - step)}>-</button>
    <input
      id={inputId}
      type="number"
      inputmode="numeric"
      {min}
      {max}
      {step}
      value={draft}
      oninput={(event) => (draft = event.currentTarget.value)}
      aria-describedby={hint ? hintId : undefined}
      onblur={commitDraft}
      {onkeydown}
    />
    <button type="button" class="step" aria-label="{label}: +{step}" disabled={value >= max} onclick={() => commit(value + step)}>+</button>
    {#if unit}<span class="unit">{unit}</span>{/if}
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

  .control {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }

  input {
    width: 88px;
    padding: 9px 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--panel-alt);
    color: var(--text-strong);
    font-family: var(--font-mono);
    font-size: 14px;
    text-align: center;
    appearance: textfield;
  }

  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    margin: 0;
    appearance: none;
  }

  input:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border-strong));
  }

  input:focus-visible {
    border-color: var(--accent);
  }

  .step {
    width: 38px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: transparent;
    font-family: var(--font-mono);
    font-size: 16px;
    color: var(--text);
  }

  .step:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text-strong);
  }

  .step:disabled {
    color: var(--subtle);
    cursor: not-allowed;
  }

  .unit {
    align-self: center;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--muted);
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }
</style>
