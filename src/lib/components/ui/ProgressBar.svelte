<script lang="ts">
  interface Props {
    /** Accessible name. */
    label: string;
    /** Part done, from 0 to `max`; null shows an indeterminate bar. */
    value: number | null;
    max?: number;
    tone?: 'accent' | 'warning' | 'danger';
    /** Human-readable value for assistive tech, e.g. "7 of 10 correct". */
    valueText?: string;
  }

  let { label, value, max = 100, tone = 'accent', valueText }: Props = $props();

  const percent = $derived(value === null || max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100)));
</script>

<div
  class="bar {tone}"
  class:indeterminate={value === null}
  role="progressbar"
  aria-label={label}
  aria-valuemin="0"
  aria-valuemax={max}
  aria-valuenow={value ?? undefined}
  aria-valuetext={valueText}
>
  <div class="fill" style:width={value === null ? undefined : `${percent}%`}></div>
</div>

<style>
  .bar {
    --fill: var(--accent);

    overflow: hidden;
    height: 8px;
    border-radius: 999px;
    background: var(--panel-alt);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .warning {
    --fill: var(--warning);
  }

  .danger {
    --fill: var(--danger);
  }

  .fill {
    height: 100%;
    border-radius: inherit;
    background: var(--fill);
    transition: width 0.2s;
  }

  .indeterminate .fill {
    width: 40%;
    animation: slide 1.2s ease-in-out infinite alternate;
  }

  @keyframes slide {
    from {
      translate: 0 0;
    }
    to {
      translate: 150% 0;
    }
  }
</style>
