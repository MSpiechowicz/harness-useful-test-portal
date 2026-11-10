<script lang="ts">
  interface CheckboxOption {
    value: string;
    label: string;
    /** Secondary text under the label. */
    description?: string;
    /** Short note under the description, e.g. a question count. */
    meta?: string;
  }

  interface Props {
    legend: string;
    options: CheckboxOption[];
    selected: string[];
    /** `cards` gives each option a bordered card in a responsive grid; `row` packs short labels in a line. */
    layout?: 'cards' | 'row';
    hint?: string;
    onchange: (selected: string[]) => void;
  }

  let { legend, options, selected, layout = 'row', hint, onchange }: Props = $props();

  const uid = $props.id();
  const hintId = `checks-hint-${uid}`;

  function toggle(value: string, on: boolean) {
    const next = on ? [...selected, value] : selected.filter((entry) => entry !== value);

    onchange(options.map((option) => option.value).filter((id) => next.includes(id)));
  }
</script>

<fieldset aria-describedby={hint ? hintId : undefined}>
  <legend>{legend}</legend>

  <div class="options {layout}">
    {#each options as option (option.value)}
      <label class="option">
        <input
          type="checkbox"
          checked={selected.includes(option.value)}
          onchange={(event) => toggle(option.value, event.currentTarget.checked)}
        />
        <span class="body">
          <span class="label">{option.label}</span>
          {#if option.description}<span class="description">{option.description}</span>{/if}
          {#if option.meta}<span class="meta">{option.meta}</span>{/if}
        </span>
      </label>
    {/each}
  </div>

  {#if hint}<p id={hintId} class="hint">{hint}</p>{/if}
</fieldset>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 8px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--muted);
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .options.cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  }

  .option {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background-color 0.15s;
  }

  .option:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  }

  .option:has(input:checked) {
    border-color: var(--accent-border);
    background: var(--accent-soft);
  }

  .option:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  input {
    margin: 2px 0 0;
  }

  input:focus-visible {
    outline: none;
  }

  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-strong);
  }

  .description {
    font-size: 13px;
    line-height: 1.5;
    color: var(--muted);
  }

  .meta {
    margin-top: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--subtle);
    white-space: nowrap;
  }

  .hint {
    margin-top: 8px;
    font-size: 13px;
    color: var(--muted);
  }
</style>
