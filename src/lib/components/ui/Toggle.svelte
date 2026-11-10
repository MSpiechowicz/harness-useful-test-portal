<script lang="ts">
  interface Props {
    label: string;
    description?: string;
    checked: boolean;
    disabled?: boolean;
    onchange: (checked: boolean) => void;
  }

  let { label, description, checked, disabled = false, onchange }: Props = $props();

  const uid = $props.id();
  const descriptionId = `toggle-desc-${uid}`;
</script>

<label class="toggle" class:disabled>
  <input
    type="checkbox"
    role="switch"
    {checked}
    {disabled}
    aria-describedby={description ? descriptionId : undefined}
    onchange={(event) => onchange(event.currentTarget.checked)}
  />
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  <span class="text">
    <span class="label">{label}</span>
    {#if description}<span id={descriptionId} class="description">{description}</span>{/if}
  </span>
</label>

<style>
  .toggle {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    cursor: pointer;
  }

  .toggle.disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .track {
    position: relative;
    flex: none;
    width: 40px;
    height: 22px;
    margin-top: 1px;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    background: var(--panel-alt);
    transition:
      background-color 0.15s,
      border-color 0.15s;
  }

  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--muted);
    transition:
      translate 0.15s,
      background-color 0.15s;
  }

  input:checked + .track {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  input:checked + .track .thumb {
    translate: 18px 0;
    background: var(--accent);
  }

  input:focus-visible + .track {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .label {
    font-size: 15px;
    color: var(--text-strong);
  }

  .description {
    font-size: 13px;
    color: var(--muted);
  }
</style>
